const util = require('util');
const querystring = require('querystring');
const http = require('http');
const https = require('https');
const fs = require('fs');
const redis = require('redis');
const axios = require('axios')

const pare = {
    "secrets": {
        "client_id":"",
        "client_secret":"",
        "redis_password":"20Valtech18"
    },
    "body":{
        "team_id": "XXXXXXXXX",
        "team_domain": "my-team",
        "channel_id": "XXXXXXXXX",
        "channel_name": "channel-name",
        "user_id": "XXXXXXXXX",
        "user_name": "axel.escalada",
        "command": "",
        "text": "login_listener palermo1"
    }
};

test(pare, console.log);
/**
 * @param context {WebtaskContext}
 */
function test(context, cb) {
    //insert code here
};
