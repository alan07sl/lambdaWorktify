const querystring = require('querystring');
const http = require('http');
const https = require('https');
const fs = require('fs');
const redis = require('redis');





/**
 * @param context {WebtaskContext}
 */
module.exports = function(context, cb) {
    const clientId = context.secrets.client_id;
    const clientSecret = context.secrets.client_secret;
    const spotifyAccountServiceHost = 'accounts.spotify.com';
    const spotifyAccountServicePath = '/api/token';

    const redisHostname = 'redis-10642.c15.us-east-1-4.ec2.cloud.redislabs.com';
    const redisPort = 10642;
    const redisPassword = context.secrets.redis_password;
    const redisAccessToken = 'access_token';

    const buildings = "palermo1,palermo2,ramos1,ramos2".split(",")
    const tokenRefresh="tokenRefresh";


    var token_type;
    var scope;
    var expires_in;

    /* Redis Client */

    const client = redis.createClient(redisPort, redisHostname, {no_ready_check: true});
    client.auth(redisPassword, function (err) {
        if (err) throw err;
    });

	buildings.forEach(function(building) {
		redisGet(tokenRefresh+building).then((refreshToken)=> {
    	if(refreshToken!=null){
	    	PostCode(refreshToken,building);
      }
    });
	});   
  cb(null, '');
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

    /* Functions to make requests. */

    function PostCode(refreshToken,building) {

        // Build the post string from an object
        var post_data = querystring.stringify({
            'grant_type' : 'refresh_token',
            'refresh_token' : refreshToken
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
            });
        });

        // post the data
        post_req.write(post_data);
        post_req.end();
    }
}
