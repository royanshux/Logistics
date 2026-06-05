import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.CONNECTION_STRING,
});

await client.connect();

const supabase = createClient(process.env.PROJECT_URL, process.env.SECRET_KEY);

// await client.query(
//     `CREATE TABLE students (
//     id SERIAL PRIMARY KEY,
//     name TEXT NOT NULL,
//     email TEXT NOT NULL UNIQUE,
//     age INTEGER,
//     cgpa INTEGER
//   )`
// );

// await client.end(); 


const {data, error} = await supabase.from('students').insert({name: 'ROY', email: 'royanshumain@gmail.com', age: 34, cgpa: 85});


console.log(data)
console.log(error)