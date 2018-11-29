'use strict';

var request = require('request');

module.exports = function(RED) {

    function Forcepoint(config) {
        RED.nodes.createNode(this, config);

        var node = this;

        const authkey = this.credentials.authkey;

        function apiCall(method, command, jar, body, callback) {
            var url = config.url && config.url.trim && config.url.trim();
            if (!url || (url.length < 8)) {                     // todo: more robust validation possibly?
                callback(new Error('Missing Forcepoint URL'));
                return;
            }
            if (url.substr(url.length - 1) !== '/') {
                url = url + '/';
            }

            request({
                method: method,
                uri: url + command,
                json: true,
                jar: jar,
                body: body
            }, function (error, response, body) {
                if (error || (response.statusCode !== 200)) {
                    return callback(error || new Error('Request Error'));
                }
                callback(null, body, response.headers);
            });
        }

        this.login = function(jar, callback) {
            if (!authkey) {
                // todo: also check api key length and format maybe?
                callback(new Error('Missing Authkey'));
                return;
            }
            const body = Object.assign({}, params, {
                authenticationkey: authkey
            });
            apiCall('POST', 'login', jar, body, function(err, json) {
                if (err) { return callback(err); }
                return callback(null);
            });
        };

        this.getIpListHref = function(jar, listName, callback) {
            if (!jar) { return callback(new Error('Not Logged In')); }
            if (!listName)  { return callback(new Error('Missing listName')); }
            apiCall('GET', 'elements/ip_list', jar, {
                name: listName
            }, function(err, json) {
                if (err) { return callback(err); }
                if (!json || !json.result) { return callback(new Error('Get Ip List Failed')); }
                for (const entry in json.result) {
                    if (entry.name === listName) {
                        return callback(null, entry.href);
                    }
                }
                callback(null, null);
            });
        };

        this.createIpList = function(jar, listName, comment, callback) {
            if (!jar) { return callback(new Error('Not Logged In')); }
            if (!listName)  { return callback(new Error('Missing listName')); }
            apiCall('POST', 'elements/ip_list', jar, {
                name: listName,
                comment: comment
            }, function(err, json, headers) {
                if (err) { return callback(err); }
                return callback(null, headers.location);
            });
        };

        this.getContentUrl = function(jar, elemUrl, callback) {
            if (!jar) { return callback(new Error('Not Logged In')); }
            if (!elemUrl)  { return callback(new Error('Missing elemUrl')); }
            apiCall('GET', elemUrl, jar, undefined, function(err, json, headers) {
                if (err) { return callback(err); }
                if (!json.link) { return callback()}
                for (const entry in json.link) {
                    if (entry.rel == "ip_address_list") {
                        return callback(null, entry.href[0])
                    }
                }
                return callback(null, undefined);
            });
        };

        this.getIpList = function(jar, contentUrl, callback) {
            if (!jar) { return callback(new Error('Not Logged In')); }
            if (!contentUrl)  { return callback(new Error('Missing contentUrl')); }
            apiCall('GET', contentUrl, jar, function(err, json) {
                if (err) { return callback(err); }
                callback(null, json);
            });
        };

        // note: Forcepoint API is broken? What about concurrency? it's conceivable overlapping concurrent calls will lose added ips using this approach.
        this.updateIps = function(jar, contentUrl, ipList, callback) {
            if (!jar) { return callback(new Error('Not Logged In')); }
            if (!contentUrl)  { return callback(new Error('Missing contentUrl')); }
            if (!ipList)  { return callback(new Error('Missing ipList')); }
            apiCall('POST', contentUrl, jar, ipList, function(err, json, headers) {
                if (err) { return callback(err); }
                return callback(null, headers.location);
            });
        };


        /**
         * todo: how do we implement the steps to upload the policy onto various firewalls?
         * todo: Is this a separate node? It seems likely. So do we make the forcepoint node send a message on success to trigger the next node to do this?
         *
        params= { 'filter':'HQ Policy' }
        r = s.get(url + 'elements/fw_policy', params=params, headers={'accept': 'application/json', 'content-type': 'application/json'})
        hq_policy_location= r.json()['result'][0]['href']
        #print("Get \'HQ Policy\' Firewall Policy URL: %s " % hq_policy_location)
        #print("Upload the 'HQ Policy' on 'Helsinki FW'...")
        r = s.post(hq_policy_location+'/upload', params=params, headers={'accept': 'application/json', 'content-type': 'application/json'})
         **/



        this.logout = function(jar, callback) {
            if (!jar) { return callback(new Error('Not Logged In')); }
            apiCall('logout', sid, {}, function(err, json) {
                if (err) { return callback(err); }
                //if (!json || !json.sid) { return callback(new Error('Add Host Failed')); }
                return callback(null, json);
            });
        };
    }

    RED.nodes.registerType("forcepoint", Forcepoint, {
        credentials: {
            authkey: { type:"password" }
        }
    });
};
