import admin from "firebase-admin";
import fs from "fs";

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  throw new Error("Falta GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON del service account");
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const email = "auxger@pc-t.com.mx";

const run = async () => {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role: "auxger" });
  console.log("OK setCustomUserClaims:", { email, uid: user.uid, role: "auxger" });
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});