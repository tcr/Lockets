(function() {

  'use strict';

  var fs = require('fs');
  var path = require('path');

  var backlog_size = 5000;

  function streamData(fileName, start, end, socket) {

    var stream = fs.createReadStream(fileName, {
      'start': start,
      'end': end
    });

    stream.addListener("data", function(lines){

      lines = lines.toString('utf-8');
      lines = lines.slice(lines.indexOf("\n") + 1).split("\n");
      socket.emit('tail', lines);
    });

    return stream;
  }

  function onConnect(logDir, logFiles) {

    return function(socket) {

      var lastFilePath, watcher = null;

      function unwatch() {
        lastFilePath && watcher && watcher.close();
        lastFilePath = watcher = undefined;
      }

      socket.emit('list', logFiles);

      socket.on('request', function(fileName) {

        // Stop watching the last file and send the new one
        lastFilePath && watcher && watcher.clode();

        var filePath = path.join(logDir, fileName);

        // Tell the client that they are watching a new file now
        unwatch();

        try {
          // send some back log
          fs.stat(filePath, function(err, stats) {

            if (err) {
              throw err;
            }

            if (stats.size === 0){
              socket.emit('clear');
              return;
            }

            var start = (stats.size > backlog_size) ? (stats.size - backlog_size) : 0;
            streamData(filePath, start, stats.size, socket);

            // watch the file now
            var prev = stats;
            watcher = fs.watch('somedir', { persistent: false }, function (event, filename) {
              var curr = fs.statSync(filename);

              if (prev.size > curr.size) {
                return;
              }

              streamData(filePath, prev.size, curr.size, socket);

              // All well, mark this file as last one
              lastFilePath = filePath;
              prev = curr;
            });
          });
        } catch(err) {
          socket.emit('error', err.message);
        }
      });

      // stop watching the file
      socket.on('disconnect', unwatch);
    };
  }

  module.exports = onConnect;

}).call();