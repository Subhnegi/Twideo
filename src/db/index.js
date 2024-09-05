import mongoose  from "mongoose";
import { DB } from "../constants.js";


const connectDB = async() => {
    try{
        const connectionInstance =   await mongoose.connect(`${process.env.DB_URI}/${DB}`)
        console.log(`\n mongodb connected!! DB host:${connectionInstance.connection.host}`)
    }catch(err){
        console.log("mongodb connection error",err);
        process.exit(1);
    }
}

export default connectDB;