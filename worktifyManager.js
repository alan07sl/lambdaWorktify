const util = require('util');
const querystring = require('querystring');
const http = require('http');
const https = require('https');
const fs = require('fs');
const redis = require('redis');
const axios = require('axios@0.15.2')




/**
 * @param context {WebtaskContext}
 */
module.exports = function(context, cb) {
    const scopes = 'user-modify-playback-state user-read-playback-state';
    const authorizeUrl = 'https://accounts.spotify.com/authorize?client_id=%s&response_type=code&redirect_uri=%s&state=%s'+
        (scopes ? '&scope=' + encodeURIComponent(scopes) : '');
    const clientId = context.secrets.client_id;
    const clientSecret = context.secrets.client_secret;
    const webTaskUrl = 'https://wt-1421b0d761ddd832608482e64eb8e4fc-0.run.webtask.io/worktify-main';
    const spotifyAccountServiceHost = 'accounts.spotify.com';
    const spotifyAccountServicePath = '/api/token';

    const apiHost = 'api.spotify.com';
    const httpsHost = 'https://' + apiHost;
    const v1Player = '/v1/me/player'
    const volumePath = v1Player + '/volume?volume_percent=';

    const redisHostname = 'redis-10642.c15.us-east-1-4.ec2.cloud.redislabs.com';
    const redisPort = 10642;
    const redisPassword = context.secrets.redis_password;
    const redisAccessToken = 'access_token';
    const redisReproducer = 'reproducer';
    const redisListener = 'listener';

    const buildings = "palermo1,palermo2,ramos1,ramos2".split(",")
    const admins = "matias.devoto,alanfrnk,axel".split(",")
    const params = context.body
    const timeoutLogin="timeoutLogin"
    const tokenRefresh="tokenRefresh";

    var token_type;
    var scope;
    var expires_in;
    var refresh_token;

    /* Redis Client */

    const client = redis.createClient(redisPort, redisHostname, {no_ready_check: true});
    client.auth(redisPassword, function (err) {
        if (err) throw err;
    });



    if(typeof context.body !== "undefined") {

        //if it comes from slack then we will have a text field in the body.
        if(typeof context.body.text !== "undefined") {
            var args = context.body.text;
            var argsArray = args.split(" ");
            var command = argsArray[0];
            var arrayLen = argsArray.length;
            var user = params.user_name;

            switch (command) {
                case 'login_listener':
                    login_listener(argsArray,user);
                    break;
                case 'login_reproducer':
                    login_reproducer(argsArray,user);
                    break;
                case 'logout':
                    logout(arrayLen,user);
                    break;
                case 'logout_admin':
                    logoutAdmin(argsArray,user);
                    break;
                case 'volume':
                    volume(argsArray,user);
                    break;
                case 'whatson':
                    whatson(arrayLen,user);
                    break;
                case 'help':
                    cb(null,getHelp());
                    break;
                default:
                    cb(null,'For more usage information please use: /worktify help');
                    break;
            }
        } else {
            cb(null, 'For more usage information please use: /worktify help');
        }
    } else { //if we don't have that then we need to check if it's the callback of spotify.
        if(typeof context.query.code !== "undefined") {
        //validate timeout
        redisGet(timeoutLogin+context.query.state).then((timeout)=> {
                  if( timeout!=null && new Date()>=new Date(timeout)) {
                    cb(null, 'Your session timedout, you have to login again.');
                  }else{
		    PostCode(context.query.code,context.query.state);
		    cb(null, 'You logged in '+context.query.state+' You can close this tab.');
		}
            	});
            
        }
    }


    /* redis functions */

    function redisSet(key, value) {
        client.set(key, value, redis.print);
        client.get(key, function (err, reply) {
            if (err) throw err;
        });
    }

    function redisDelete(key){
        return new Promise((success, err) => {
            client.del(key, function(error, result) {
                if (error)
                    reject(Error("Redis failed."));
                else {
                    success(result);
                }
            });
        });
    }

    function redisGet(key) {
        return new Promise((success, err) => {
            client.get(key, function(error, result) {
                if (error)
                    reject(Error("Redis failed."));
                else {
                    success(result);
                }
            });
        });
    }

    /* Functions to handle each command. */

    function login_reproducer(argsArray,user) {
        var reproductionPlace = argsArray[1];
        var token = redisAccessToken+'Reproducer'+reproductionPlace
        if(argsArray.length == 2 && buildings.includes(reproductionPlace)) {
            resetUserLogin(user);
            redisGet(token).then((access_token)=> {
            	redisGet(timeoutLogin+reproductionPlace).then((timeout)=> {
                  if( access_token == null||timeout==null||new Date()>=new Date(timeout)) {
                      redisSet(token, user);
                      redisSet(user, reproductionPlace);
                      redisSet(timeoutLogin+reproductionPlace, new Date(new Date().getTime() + 5*60000));
                  } else {
                      cb(null, access_token+' is already logged.')
                  }
                  cb(null, 'Please login and authorize worktify here:' + util.format(authorizeUrl, clientId, webTaskUrl,reproductionPlace));
            	});
            });
        } else {
            cb(null, 'Login command must have 1 parameter that is workplace, possible values '+ buildings +'.');
        }
    }

    function login_listener(argsArray,user) {
        var reproductionPlace = argsArray[1];
        if(argsArray.length == 2 && buildings.includes(reproductionPlace)) {
            resetUserLogin(user);
            redisGet(user).then((userValue)=>{
                if(userValue == null){
                    redisSet(user, reproductionPlace);
                    cb(null, 'You were logged as listener in '+reproductionPlace);
                }else
                    cb(null, 'You are already logged');
            });
        } else {
            cb(null, 'Login command must have 1 parameter that is workplace, possible values '+ buildings +'.');
        }
    }

    function logout(len,user) {
        if(len == 1) {
            resetUserLogin(user);
            cb(null, 'Logout success.');
        } else {
            cb(null, 'Logout command must have no parameters.');
        }
    }
    
     function logoutAdmin(argsArray,user) {
      cb(null, argsArray[1]);        
      if(admins.includes(user)) {
                resetUserLogin(argsArray[1]);
                cb(null, 'Logout success for '+argsArray[1]);
            } else {
                cb(null, 'For more usage information please use: /worktify help');
            }
    }

    function resetUserLogin(user) {
        redisGet(user).then((building)=> {
            if(building != null){
		redisGet(redisAccessToken+'Reproducer'+building).then((userReproducing)=> {
			if(user == userReproducing){
				redisDelete(redisAccessToken+building);
				redisDelete(redisAccessToken+'Reproducer'+building);
        redisDelete(tokenRefresh+building);
			}
 		}).catch(()=>{
                                console.log('Redis failed getting token.')
                                cb(null, 'Ups, we got a problem.');
                            });

            }
        }).catch(()=> {
            console.log('Redis failed getting token.');
	    cb(null, 'Ups, we got a problem.');
        });
        redisDelete(user);
    }

    function volume(argsArray,user) {
        var percentage = argsArray[1];
        if(argsArray.length == 2 && isInt(percentage) && percentage >= 0 && percentage<= 100) {
            redisGet(user).then((building)=> {
                if(buildings.includes(building)){
                    redisGet(redisAccessToken+building).then((access_token)=> {
                        if(access_token != null){
                            axios.put(httpsHost + volumePath + percentage,{},{headers: {
                                    'Authorization': 'Bearer ' + access_token
                                }}).then(()=> {
                                cb(null, util.format('You set the volume to %d%.', percentage));
                            }).catch((e)=>{
                                console.log('Cant reach Spotify API.')
                                cb(null, 'is the Reproducer playing something?');
                            });
                        } else{
                            cb(null, 'Nobody is loggued as Reproducer.');
                        }
                    }).catch(()=> {
                        console.log('Redis failed getting token.');
                        cb(null, 'Ups, we got a problem.');
                    });
                }else{
                    cb(null, 'Please, login first.');
                }
            }).catch(()=> {
                console.log('Redis failed getting users location.');
                cb(null, 'Ups, we got a problem.');
            });
        } else {
            cb(null, 'Volume command just recives an argument with range is 0-100.');
        }
    }

    function whatson(len,user) {
        if(len == 1 ) {
            redisGet(user).then((building)=> {
                if(buildings.includes(building)){
                    redisGet(redisAccessToken+building).then((access_token)=> {
                        if( access_token != null){
                            axios.get(httpsHost + v1Player,{headers: {
                                    'Authorization': 'Bearer ' + access_token
                                }}).then((response)=> {
                                cb(null, util.format('You are currently listening to %s from %s.', response.data.item.name, response.data.item.artists[0].name));
                            }).catch(()=>{
                                console.log('Cant reach Spotify API.')
                                cb(null, 'is the Reproducer playing something?');
                            });
                        } else{
                            cb(null, 'Nobody is loggued as Reproducer.');
                        }
                    }).catch(()=> {
                        console.log('Redis failed getting token.');
                        cb(null, 'Ups, we got a problem.');
                    });
                }else{
                    cb(null, 'Please, login first.');
                }
            }).catch(()=> {
                console.log('Redis failed getting users location.');
                cb(null, 'Ups, we got a problem.');
            });
        } else {
            cb(null, 'Whatson command does not recive any parameters.');
        }
    }

     function getHelp(){
        return "Commands:"+
		"/worktify login_reproducer <building>"+
		"/worktify login_listener <building>"+
		"/worktify logout"+
		"/worktify volume <0-100>"+
		"/worktify whatson";
    }

    /* Functions to make requests. */

    function PostCode(codestring,building) {

        // Build the post string from an object
        var post_data = querystring.stringify({
            'grant_type' : 'authorization_code',
            'code' : codestring,
            'redirect_uri' : webTaskUrl
        });

        // An object of options to indicate where to post to
        var post_options = {
            host: spotifyAccountServiceHost,
            path: spotifyAccountServicePath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
            }
        };



        // Set up the request
        var post_req = https.request(post_options, function(res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                var obj = JSON.parse(chunk);
                redisSet(redisAccessToken+building, obj.access_token);
                token_type = obj.token_type;
                scope = obj.scope;
                expires_in = obj.expires_in;
                redisSet(tokenRefresh+building, obj.refresh_token);
            });
        });

        // post the data
        post_req.write(post_data);
        post_req.end();
    }
    function isInt(value) {
    return !isNaN(value) && 
           parseInt(Number(value)) == value && 
           !isNaN(parseInt(value, 10));
  }
}
