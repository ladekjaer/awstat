var url = require('url');
var http = require('http');
var https = require('https');
var open = require('open');

var options = {
    hostname: 'accounts.google.com',
    port: 443,
    path: '/o/oauth2/token',
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
};

module.exports.getTokens = function(clientId, clientSecret, redirectUri, callback) {
    var time = new Date().getTime();
    var authRequestUrl = 'https://www.googleapis.com/auth/adwords';
    authRequestUrl += '?scope=' + encodeURIComponent('https://adwords.google.com/api/adwords');
    authRequestUrl += '&response_type=code';
    authRequestUrl += '&access_type=offline';
    authRequestUrl += '&approval_prompt=force';
    authRequestUrl += '&client_id=' + clientId;
    authRequestUrl += '&redirect_uri=' + encodeURIComponent(redirectUri);

    var httpServer = http.createServer(function(req, res) {
        console.log(req.url);
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('You can now close this browser.');
        if (req.url.indexOf('code=') != -1) {
            authorizationCode = url.parse(req.url, true).query.code;
            getTokens(clientId, clientSecret, redirectUri, authorizationCode, function(err, tokens) {
                if (err) return callback(err);
                httpServer.close();
                for (var i = 0; i < sockets.length; i++) {
                    sockets[i].destroy();
                }
                tokens.expires = time + tokens.expires_in * 1000;
                callback(null, tokens);
            });
        } else if (req.url.indexOf('favicon' === -1)) {
            httpServer.close();
            for (var i = 0; i < sockets.length; i++) {
                sockets[i].destroy();
            };
        }
    });
    httpServer.listen(3000, 'localhost');

    var sockets = [];
    httpServer.on('connection', function(socket) {
        sockets.push(socket);
    });

    open(authRequestUrl);
}

module.exports.refresh = function(clientId, clientSecret, refreshToken, callback) {
    var time = new Date().getTime();
    var authRequestUrl = 'https://accounts.google.com/o/oauth2/auth';
    var request = https.request(options, function(response) {
        response.setEncoding('utf8');
        var token = '';
        response.on('data', function(chunk) {
            token += chunk;
        });
        response.on('end', function() {
            token = JSON.parse(token);
            token.expires = time + token.expires_in * 1000;
            token.statusCode = response.statusCode;
            callback(null, token);
            return;
        });
    });
    request.on('error', function(err) {
        callback(err, null);
        return;
    });
    request.write('client_id=' + clientId);
    request.write('&client_secret=' + clientSecret);
    request.write('&refresh_token=' + refreshToken);
    request.write('&grant_type=refresh_token');
    request.end();
}

function getTokens(clientId, clientSecret, redirectUri, authorizationCode, callback) {
    var request = https.request(options, function(response) {
        var token = '';
        response.setEncoding('utf8');
        response.on('data', function(chunk) {
            token += chunk;
        });
        response.on('end', function() {
            token = JSON.parse(token);
            token.statusCode = response.statusCode;
            return callback(null, token);
        });
    });
    request.on('error', function(err) {
        return callback(err, null);
    });
    request.write('code=' + authorizationCode);
    request.write('&client_id=' + clientId);
    request.write('&client_secret=' + clientSecret);
    request.write('&redirect_uri=' + redirectUri);
    request.write('&grant_type=authorization_code');
    request.end();
}
