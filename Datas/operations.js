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


// insert second driver user
const { data: newDriver, error: driverError } = await supabase.from('users').insert({
  phone: '919769438747',
  name: 'Test Driver 2',
  user_type: 'DRIVER',
  is_verified: true,
  is_active: true,
  onboarding_complete: true,
}).select().single()

console.log('driver created:', newDriver)
console.log(driverError)

// insert their availability matching MUMBAI -> DELHI CONTAINER load
const { data: avail, error: availError } = await supabase.from('driver_availability').insert({
  user_id: newDriver.id,
  phone: '919769438747',
  source: 'MUMBAI',
  destination: 'DELHI',
  truck_type: 'CONTAINER',
  capacity: 12,
  l_min: 14000,
  l_max: 26000,
  available_from: '2026-06-07T08:00:00Z',
  expires_at: '2026-06-08T08:00:00Z',
  status: 'ACTIVE',
  current_match_id: null,
  pending_load_id: null,
})

console.log('availability created:', avail)
console.log(availError)