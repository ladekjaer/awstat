#!/usr/bin/env node

var fs = require('fs');
var http = require('http');
var https = require('https');
var router = require('router');
var route = router();
var pejs = require('pejs');
var url = require('url');
var adwordsAuth = require('./adwords-auth');
var configPath = require('osenv').home()+'/.gawr';
var dotjson = require('dotjson');
var views = pejs();
var auth = {};

route.get('/', function(req, res) {
    views.render('./index.html', {title: 'AdWords reporting'}, function(err, result) {
        res.statusCode = 200;
        res.end(result);
    });
});

route.get('/setup', function(req, res) {
    auth.title = 'AdWords reporting';
    views.render('./setup.html', auth, function(err, result) {
        res.statusCode = 200;
        res.end(result);
    });
});

route.get('/initialize', function(req, res) {
    var queries = url.parse(req.url, true).query;
    dotjson.set(configPath,
        {
            clientId: queries.clientId,
            clientSecret: queries.clientSecret,
            developerToken: queries.developerToken,
            clientCustomerId: queries.clientCustomerId
        }, {createFile: true});
    auth.clientId = queries.clientId;
    auth.clientSecret = queries.clientSecret;
    auth.developerToken = queries.developerToken;
    auth.clientCustomerId = queries.clientCustomerId;
    res.writeHead(301, {'Location': '/'});
    res.end();
    getRefreshToken();
});

route.get('/report', function(req, res) {
    var awql = url.parse(req.url, true).query.awql;
    var body = '__rdquery='+encodeURIComponent(awql)+'&__fmt=TSV';
    var headers = {
        Authorization: 'Bearer '+auth.accessToken,
        developerToken: auth.developerToken,
        clientCustomerId: auth.clientCustomerId,
        returnMoneyInMicros: 'true'
    };
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = body.length;

    console.log(headers);

    var postOptions = {
        hostname: 'adwords.google.com',
        port: 443,
        path: '/api/adwords/reportdownload/v201402',
        method: 'POST',
        headers: headers
    };

    var post_req = https.get(postOptions, function(post_res) {
        var report = '';
        if (post_res.statusCode === 200) {
            post_res.on('data', function(chunk) {
                report += chunk;
            });
            post_res.on('end', function(chunk) {
                var lineNo = 0;
                var reportTable = '';
                reportTable += '<table>\n';
                report.split('\n').forEach(function(line) {
                    lineNo++;
                    if (lineNo === 2) {
                        reportTable += '\t<thead>\n\t\t<tr>\n';
                        line.split('\t').forEach(function(field) {
                            reportTable += '\t\t\t<th>'+field+'</th>\n';
                        });
                        reportTable += '\t\t</tr>\n\t</thead>\n\t<tbody>\n';
                    }
                    if (lineNo > 2) {
                        reportTable += '\t\t<tr>\n'
                        line.split('\t').forEach(function(value) {
                            reportTable += '\t\t\t<td>'+value+'</td>\n';
                        });
                        reportTable += '\t\t</tr>\n';
                    }
                });
                reportTable += '\t</tbody></table>';

                var content = {
                    title: 'AdWords reporting',
                    awql: awql,
                    report: reportTable
                };

                views.render('./report.html', content, function(err, result) {
                    res.statusCode = 200;
                    res.end(result);
                });
            });
        }
        if (post_res.statusCode !== 200) {
            post_res.on('data', function(chunk) {
                process.stderr.write(chunk);
            });
        }
    });
    post_req.on('error', function(e) {
        console.error('Problem with request: ' + e.message);
    });
    post_req.write(body);
    post_req.end();
});

if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '{}');

auth.clientId = dotjson.get(configPath, 'clientId');
auth.clientSecret = dotjson.get(configPath, 'clientSecret');
auth.developerToken = dotjson.get(configPath, 'developerToken');
auth.clientCustomerId = dotjson.get(configPath, 'clientCustomerId');
auth.refreshToken = dotjson.get(configPath, 'refreshToken');
auth.accessToken = dotjson.get(configPath, 'accessToken');
auth.accessTokenExpires = dotjson.get(configPath, 'accessTokenExpires');

var getRefreshToken = function(callback) {
    console.log('Requesting refresh token.')
    var redirectUri = 'http://localhost:3000';
    adwordsAuth.getTokens(auth.clientId, auth.clientSecret, redirectUri, function(err, token) {
        auth.refreshToken = token.refresh_token;
        auth.accessToken = token.access_token;
        auth.accessTokenExpires = token.expires;
        dotjson.set(configPath, {refreshToken: auth.refreshToken});
    });
};

// Try to refresh access token and then start webserver.
adwordsAuth.refresh(auth.clientId, auth.clientSecret, auth.refreshToken, function(err, token) {
    console.log('Status code was '+token.statusCode+'.');
    if (token.statusCode === 200) {
        auth.accessToken = token.access_token;
        auth.accessTokenExpires = token.expires;
        http.createServer(route).listen(8080);
    } else {
        getRefreshToken(function(err) {});
        http.createServer(route).listen(8080);
    }
});
