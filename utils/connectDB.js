require('dotenv').config();
const mongoose   	 		= require("mongoose");
const ExpressError 		= require('./ExpressError');

module.exports = async () => {
  try {
    const db = mongoose.connection;
    db.on('error', err => {
      console.error.bind(console, "db: connection error;");
      throw new ExpressError(`Database Error: ${err}`, 404)
    });
    db.once("open", () => console.log("database connected"));
    console.log(`MongoDB Connecting;`)
    const conn = mongoose.connect(process.env.MONGO_URI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // useFindAndModify: false,
      // useCreateIndex: true
    })
  } catch(error){
    console.log('catch: connection monitor error: ', error.message);
    throw new ExpressError(`Database Error: ${error}`, 400)
  };
}
