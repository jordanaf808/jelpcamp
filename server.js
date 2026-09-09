// Process entry point. This is the ONLY module that touches the world: it opens
// the database connection and binds the port. app.js builds the Express app and
// exports it without either side effect, so tests can require it directly.
//
// Render runs `npm start`, which points here. If that ever stops being true the
// deploy fails at boot rather than at build, so verify locally before pushing:
//
//   PORT=3334 node server.js
//
// Port 3334 deliberately: 3333 is the dev server from .env and 3000 is a
// different Next.js project on this machine.
require('dotenv').config()

const app = require('./app')
const connectDB = require('./utils/connectDB')

const port = process.env.PORT || 3000

connectDB()

const server = app.listen(port, () => {
	console.log(`YelpCamp listening at ${port}`)
})

// // Kill App On SIGTERM
// process.on('SIGTERM', () => {
//   console.info('SIGTERM signal received.');
//   console.log('Closing http server.');
//   server.close(() => {
//     console.log('Http server closed.');
//     // boolean means [force],
//     mongoose.connection.close(false, () => {
//       console.log('MongoDb connection closed.');
// 			// NodeJS will exit when the EventLoop queue is empty and there is nothing left to do.
// 			// But sometimes, your application can have more functions and will not exit automatically.
// 			// We need to exit from the process using process.exit function.
// 			// 0 means exit with a "success" code.
//       process.exit(0);
//     });
//   });
// });

module.exports = server
