require('dotenv').config();
const fs=require('fs'),path=require('path'),connect=require('../config/database');
const User=require('../models/User'),Session=require('../models/Session'),Registration=require('../models/Registration');
const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(__dirname,'..',name),'utf8'))}catch{return[]}};
(async()=>{await connect();for(const item of read('content.json'))await Session.updateOne({id:item.id},item,{upsert:true});for(const item of read('users.json'))await User.updateOne({email:item.email},item,{upsert:true});for(const item of read('user.json'))await Registration.updateOne({id:item.id},item,{upsert:true});console.log('Migration complete.');process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
