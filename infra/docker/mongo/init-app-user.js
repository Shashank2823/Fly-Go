// Runs once, on first initialisation of the Mongo volume.
// Creates a least-privilege application user scoped to the FlyGo databases
// (the main database plus an isolated one used only by the integration tests).
const dbName = process.env.MONGO_INITDB_DATABASE || 'flygo';
db.getSiblingDB(dbName).createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [
    { role: 'readWrite', db: dbName },
    { role: 'readWrite', db: `${dbName}_test` },
  ],
});
