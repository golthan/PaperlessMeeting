import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";
import { hashPassword } from "../utils/password.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const schema = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  await pool.query(`
    TRUNCATE
      vote_responses,
      votes,
      minutes,
      meeting_tasks,
      attendance_tokens,
      agenda_items,
      documents,
      meeting_participants,
      meetings,
      rooms,
      users,
      departments
    RESTART IDENTITY CASCADE
  `);

  const departments = {};
  for (const item of [
    ["it", "Phong Cong nghe thong tin", "Quan ly he thong va ha tang CNTT"],
    ["training", "Phong Dao tao", "Quan ly dao tao va hoc vu"],
    ["admin", "Phong Hanh chinh", "Dieu phoi hanh chinh tong hop"]
  ]) {
    const { rows } = await pool.query(
      `INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING *`,
      [item[1], item[2]]
    );
    departments[item[0]] = rows[0];
  }

  const passwordHash = await hashPassword("123456");
  const users = {};
  const userSeeds = [
    ["admin", "System Admin", "admin@example.com", "ADMIN", departments.admin.id],
    [
      "organizer",
      "Meeting Organizer",
      "organizer@example.com",
      "ORGANIZER",
      departments.it.id
    ],
    [
      "participant1",
      "Participant One",
      "participant1@example.com",
      "PARTICIPANT",
      departments.training.id
    ],
    [
      "participant2",
      "Participant Two",
      "participant2@example.com",
      "PARTICIPANT",
      departments.it.id
    ]
  ];

  for (const [key, fullName, email, role, departmentId] of userSeeds) {
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role`,
      [fullName, email, passwordHash, role, departmentId]
    );
    users[key] = rows[0];
  }

  const rooms = {};
  for (const item of [
    ["a101", "Phong hop A101", "Tang 1 - Khu A", 30, "Phong hop nho"],
    ["b202", "Phong hop B202", "Tang 2 - Khu B", 60, "Phong hop hoi dong"],
    ["online", "Phong hop truc tuyen", "Online", 200, "Phong hop hybrid"]
  ]) {
    const { rows } = await pool.query(
      `INSERT INTO rooms (name, location, capacity, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [item[1], item[2], item[3], item[4]]
    );
    rooms[item[0]] = rows[0];
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(10, 30, 0, 0);

  const { rows: meetingRows } = await pool.query(
    `INSERT INTO meetings (title, description, start_time, end_time, room_id, organizer_id, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 'UPCOMING', $7)
     RETURNING *`,
    [
      "Hop trien khai ke hoach thang",
      "Thong nhat ke hoach lam viec va phan cong nhiem vu.",
      tomorrow,
      tomorrowEnd,
      rooms.a101.id,
      users.organizer.id,
      "Seed demo meeting"
    ]
  );
  const meeting = meetingRows[0];

  await pool.query(
    `INSERT INTO meeting_participants (meeting_id, user_id, invitation_status, role_in_meeting)
     VALUES ($1, $2, 'PENDING', 'MEMBER'), ($1, $3, 'ACCEPTED', 'SECRETARY')`,
    [meeting.id, users.participant1.id, users.participant2.id]
  );

  await pool.query(
    `INSERT INTO agenda_items (meeting_id, title, description, presenter_id, duration_minutes, sort_order)
     VALUES
       ($1, 'Khai mac', 'Gioi thieu noi dung hop', $2, 10, 1),
       ($1, 'Ke hoach thang', 'Thong qua ke hoach va KPI', $2, 30, 2)`,
    [meeting.id, users.organizer.id]
  );

  await pool.query(
    `INSERT INTO votes (meeting_id, title, description, type, options, created_by)
     VALUES ($1, 'Thong qua ke hoach thang', 'Bieu quyet thong qua ke hoach', 'YES_NO_ABSTAIN', '["YES","NO","ABSTAIN"]', $2)`,
    [meeting.id, users.organizer.id]
  );

  await pool.query(
    `INSERT INTO minutes (meeting_id, content, status, created_by)
     VALUES ($1, 'Noi dung bien ban demo se duoc cap nhat sau cuoc hop.', 'DRAFT', $2)`,
    [meeting.id, users.organizer.id]
  );

  await pool.query(
    `INSERT INTO meeting_tasks (meeting_id, assigned_to, assigned_by, title, description, deadline, priority)
     VALUES ($1, $2, $3, 'Chuan bi bao cao tien do', 'Tong hop noi dung va gui truoc cuoc hop tiep theo.', CURRENT_DATE + INTERVAL '7 days', 'HIGH')`,
    [meeting.id, users.participant1.id, users.organizer.id]
  );

  console.log("Database seeded successfully.");
  console.log("Accounts: admin@example.com / organizer@example.com / participant1@example.com / participant2@example.com");
  console.log("Password for all accounts: 123456");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

