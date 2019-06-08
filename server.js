const http = require("http");
var process = require("child_process");
var admin = require("firebase-admin");

const hostname = "localhost";
const port = 8080;
var serviceAccount = require("./flutter-ci-firebase-adminsdk-bwv0i-959c6868b2");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://flutter-ci.firebaseio.com"
});

const server = http.createServer((req, res) => {
  var bodyList = [];
  req
    .on("data", chunk => {
      bodyList.push(chunk);
    })
    .on("end", () => {
      var body = JSON.parse(Buffer.concat(bodyList).toString());
      var repoPath = body.repository.full_name;
      var b = repoPath.split("/");
      var repoName = b[b.length - 1];

      var child = process.execFile("./ci_script", [repoPath]);

      var ref = admin
        .database()
        .ref("logs")
        .child(repoName)
        .push();
      var docRef = admin
        .firestore()
        .collection("builds")
        .doc(ref.key);

      docRef.set({
        building: true,
        startedAt: new Date().getTime(),
        projectName: body.repository.name,
        projectId: repoName,
        owner: body.repository.owner.display_name
      });
      admin.messaging().sendToTopic(repoName + "_started", {
        notification: {
          body: body.repository.name + " build started."
        }
      });

      var logs = "Started building!!!!!";
      ref.set(logs);
      child.stdout.on("data", function(data) {
        // Logs are printed here one after another
        logs = logs + "/n" + data.toString();
        ref.set(logs);
      });
      child.stdout.on("error", function(data) {
        admin.messaging().sendToTopic(repoName + "_ended", {
          notification: {
            body: body.repository.name + " build failed."
          }
        });
        docRef.update({
          building: false,
          failed: true,
          endedAt: new Date().getTime()
        });
      });
      child.stdout.on("exit", function(data) {
        admin.messaging().sendToTopic(repoName + "_ended", {
          notification: {
            body: body.repository.name + " build completed sucessfully."
          }
        });
        docRef.update({
          building: false,
          success: true,
          endedAt: new Date().getTime()
        });
      });
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end("Started Building apk");
    });
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
