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
  const authorizeUrl = 'https://accounts.spotify.com/authorize?client_id=%s&response_type=code&redirect_uri=%s'+
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

  const buildings = "palermo1,palermo2,ramos1,ramos2".split(",")
  const params = JSON.parse(JSON.stringify(context.body))
  
  var token_type;
  var scope;
  var expires_in;
  var refresh_token;

  /* Redis Client */

  var client = redis.createClient(redisPort, redisHostname, {no_ready_check: true});
  client.auth(redisPassword, function (err) {
      if (err) throw err;
  });

  function redisSet(key, value) {
    client.set(key, value, redis.print);
    client.get(key, function (err, reply) {
          if (err) throw err;
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

  if(typeof context.body !== "undefined") {

    //if it comes from slack then we will have a text field in the body.
    if(typeof context.body.text !== "undefined") {
      var args = context.body.text;
      var argsArray = args.split(" ");
      var command = argsArray[0];
      var arrayLen = argsArray.length;
			var user = params.user_name;
      switch (command) {
        case 'login':
          login(arrayLen,user);
          break;
        case 'logout':
          logout(arrayLen);
          break;
        case 'volume':
          volume(argsArray);
          break;
        case 'whatson':
          whatson(arrayLen);
          break;
        case 'oncall on':
          cb(null, 'Set oncall on');
          break;
          case 'oncall off':
          cb(null, 'Set oncall off');
          break;
        case 'help':
          cb(null, 'Help text.');
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
        PostCode(context.query.code);
        cb(null, 'You logged in. You can close this tab.'); 
      }
  }
    

  /* Functions to make requests. */

  function PostCode(codestring) {
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
            redisSet(redisAccessToken, obj.access_token);
            token_type = obj.token_type;
            scope = obj.scope;
            expires_in = obj.expires_in;
            refresh_token = obj.refresh_token;
        });
    });

    // post the data
    post_req.write(post_data);
    post_req.end();
  }
  
  /* Functions to handle each command. */
  
  function login(len,test) {
    if(len == 1) {
      cb(null, 'Please login and authorize worktify here:'+ params+' dddd ' + util.format(authorizeUrl, clientId, webTaskUrl));
    } else {
      cb(null, 'Login command must have no parameters.');
    }
  }
  
  function logout(len) {
    if(len == 1) {
      redisGet(redisAccessToken).then((access_token)=> {
      if(access_token != '-1') {
        redisSet(redisAccessToken, '-1');
      } else {
        cb(null, 'You were not logged in.')
      }
      cb(null, 'You have logged out, thanks for using worktify.');
      });
    } else {
      cb(null, 'Logout command must have no parameters.');
    }
  }
  
  function volume(argsArray) {
    var percentage = argsArray[1];
    if(argsArray.length == 2 && percentage >= 0 && percentage<= 100) {
      redisGet(redisAccessToken).then((access_token)=> {
        if(access_token != -1){
          axios.put(httpsHost + volumePath + percentage,{},{headers: {
                      'Authorization': 'Bearer ' + access_token
                  }}).then(()=> {
            cb(null, util.format('You set the volume to %d%.', percentage));  
          }).catch(()=>{
            console.log('Cant reach Spotify API.')
          });
        } else{
            cb(null, 'Please, login first.');
        }
      }).catch(()=> {
        console.log('Redis failed.');
      });
    } else {
      cb(null, 'Volume command just recives an argument with range is 0-100.');
    }
  }

  function whatson(len) {
    if(len == 1) {
      redisGet(redisAccessToken).then((access_token)=> {
        if(access_token != -1){
           axios.get(httpsHost + v1Player,{headers: {
                      'Authorization': 'Bearer ' + access_token
                  }}).then((response)=> {
            cb(null, util.format('You are currently listening to %s from %s.', response.data.item.name, response.data.item.artists[0].name));  
          }).catch(()=>{
            console.log('Cant reach Spotify API.')
          });
        } else{
            cb(null, 'Please, login first.');
        }
      }).catch(()=> {
        console.log('Redis failed.');
      });
    } else {
      cb(null, 'Whatson command does not recive any parameters.');
    }
  }
};
