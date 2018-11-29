
const async = require('async');
var request = require('request');

/*
<div class="form-row">
        <input type="checkbox" id="node-input-includeUrls" style="display: inline-block; width: auto; vertical-align: top;">
        <label for="node-input-includeUrls" style="width: 70%;"><span data-i18n="node-red:httpin.basicauth">Use basic authentication</span></label>
    </div>
 */

module.exports = function(RED) {

    function Block(config) {
        RED.nodes.createNode(this, config);

        var node = this;

        this._forcepoint = RED.nodes.getNode(config.forcepoint);

        node.on('input', function(msg) {

            const ip = msg.payload.ip;
            const ipListName = msg.payload.ipListName || config.ipListName || 'bad_shared_ip';
            const comment = msg.payload.comment || config.comment || 'Added via node-red';

            if (!ip) {
                node.status({ fill: "red", shape: "dot", text: "Missing ip" });
                node.error("Missing payload.ip", msg);
                return;
            }
            node.status({ fill: "blue", shape: "dot", text: "Connecting" });

            async.auto({
                jar: function(callback) {
                    const jar = request.jar();
                    node._forcepoint.login(jar, function (err) {
                        return callback(err, jar);
                    });
                },

                existingIpListHref: ['jar', function(data, callback) {
                    node.status({ fill: "blue", shape: "dot", text: "Checking for List" });
                    node.log('existingIpListHref');
                    node._forcepoint.getIpList(data.jar, ipListName, callback);
                }],

                ipListHref: ['existingIpListHref', function(data, callback) {
                    if (data.existingIpListHref) {
                        return callback(null, data.existingIpListHref);
                    }
                    node.status({ fill: "blue", shape: "dot", text: "Creating List" });
                    node.log('ipListHref');
                    node._forcepoint.createIpList(data.jar, ipListName, comment, callback);
                }],

                ipList: ['ipListHref', function(data, callback) {
                    if (!data.ipListHref) {
                        return callback(new Error('IP List Error'));
                    }
                    node.status({ fill: "blue", shape: "dot", text: "Retrieving List" });
                    node.log('ipList');
                    node._forcepoint.getIpList(data.jar, data.ipListHref, comment, callback);
                }],

                checkIp: ['ipList', function(data, callback) {
                    for (const existingIp in data.ipList.ip) {
                        if (existingIp === ip) {
                            return callback(new Error('already in list'));
                        }
                    }
                    callback(null);
                }],

                addIp: ['checkIp', function(data, callback) {
                    node.status({ fill: "blue", shape: "dot", text: "Adding Ip" });
                    node.log('blockIp');
                    const newIpList = data.ipList;
                    newIpList.ip.append(ip);
                    node._forcepoint.updateIps(data.jar, data.ipListHref, newIpList, callback);
                }],

            
            }, function(err, data) {
                if (err) {
                    node.error(err.message, msg);

                    if (err.message === 'already in list') {
                        node.status({ fill: "orange", shape: "dot", text: ip + ' Already Blocked' });
                        return;
                    }

                    node.status({ fill: "red", shape: "dot", text: err.message});
                    return console.log(err);
                }

                node.status({ fill: "blue", shape: "dot", text: "Disconnect" });
                node._forcepoint.logout(data.jar, function(err) { node.log("Logged Out " + ip); });

                node.log("Blocked " + ip);
                node.status({ fill: "green", shape: "dot", text: "Blocked " + ip });
            });
        });
    }
    RED.nodes.registerType("forcepoint block", Block);
};
