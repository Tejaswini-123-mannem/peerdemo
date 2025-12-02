// Simple demo data seeder for Peer2Loan
//
// Usage (from backend root):
//   NODE_ENV=development node seedDemoData.js
//
// It will:
//   1. Connect to MongoDB (MONGO_URI or mongodb://localhost:27017/peer2loan)
//   2. Wipe Users, Groups and Cycles collections
//   3. Create:
//      - 1 organizer: org1
//      - 4 members : mem1, mem2, mem3, mem4
//        (all passwords: pwd123)
//   4. Create 3 demo groups with different turn-order policies:
//      - Fixed policy: mostly complete cycles with some penalties
//      - Randomized policy: mid‑way cycles
//      - Admin‑approval policy: early stage

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Group = require('./models/Group');
const Cycle = require('./models/Cycle');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peer2loan';

async function main() {
  console.log('Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  console.log('Clearing existing data (Users, Groups, Cycles)...');
  await Promise.all([
    User.deleteMany({}),
    Group.deleteMany({}),
    Cycle.deleteMany({})
  ]);

  console.log('Creating users (org1, mem1–mem4)...');
  const password = 'pwd123';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  const org1 = await User.create({
    name: 'org1',
    email: 'org1@example.com',
    passwordHash: hash,
    role: 'organizer'
  });

  const mem1 = await User.create({
    name: 'mem1',
    email: 'mem1@example.com',
    passwordHash: hash,
    role: 'member'
  });
  const mem2 = await User.create({
    name: 'mem2',
    email: 'mem2@example.com',
    passwordHash: hash,
    role: 'member'
  });
  const mem3 = await User.create({
    name: 'mem3',
    email: 'mem3@example.com',
    passwordHash: hash,
    role: 'member'
  });
  const mem4 = await User.create({
    name: 'mem4',
    email: 'mem4@example.com',
    passwordHash: hash,
    role: 'member'
  });

  const members = [mem1, mem2, mem3, mem4];

  // Helper to build due dates monthIndex months from a start date
  const buildDueDate = (start, monthIndex) => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + monthIndex);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // --- GROUP 1: Fixed policy, mostly completed (good for streaks & penalties) ---
  console.log('Creating Group 1 (fixed policy, mostly completed)...');
  const startMonth1 = new Date();
  startMonth1.setMonth(startMonth1.getMonth() - 3); // 3 months ago
  startMonth1.setDate(1);

  const group1 = await Group.create({
    name: 'Group Fixed Demo',
    currency: 'INR',
    monthlyContribution: 2000,
    groupSize: 4,
    startMonth: startMonth1,
    paymentWindow: '1-7',
    penaltyRules: 'Simple demo penalties',
    turnOrderPolicy: 'fixed',
    gracePeriodDays: 1,
    createdBy: org1._id,
    members: members.map((m, idx) => ({
      user: m._id,
      payoutAccount: `demo-account-${m.name}`,
      isActive: true,
      turnPosition: idx + 1
    }))
  });

  const cycles1 = [];
  for (let i = 0; i < group1.groupSize; i++) {
    const dueDate = buildDueDate(group1.startMonth, i);
    const payments = members.map((m, memberIndex) => {
      // mem1: always on time
      if (m._id.equals(mem1._id)) {
        return {
          member: m._id,
          paidAt: new Date(dueDate.getTime() + 2 * 24 * 60 * 60 * 1000),
          amount: group1.monthlyContribution,
          penaltyAmount: 0,
          penaltyDays: 0,
          status: 'paid'
        };
      }

      // mem2: one late payment (cycle 1)
      if (m._id.equals(mem2._id) && i === 1) {
        return {
          member: m._id,
          paidAt: new Date(dueDate.getTime() + 10 * 24 * 60 * 60 * 1000),
          amount: group1.monthlyContribution,
          penaltyAmount: 200,
          penaltyDays: 3,
          status: 'paid'
        };
      }

      // mem3: missed last cycle entirely (no record for final cycle)
      if (m._id.equals(mem3._id) && i === group1.groupSize - 1) {
        return undefined;
      }

      // others: paid on time
      return {
        member: m._id,
        paidAt: new Date(dueDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        amount: group1.monthlyContribution,
        penaltyAmount: 0,
        penaltyDays: 0,
        status: 'paid'
      };
    }).filter(Boolean);

    cycles1.push(
      new Cycle({
        group: group1._id,
        monthIndex: i,
        dueDate,
        payments,
        payoutExecuted: i < 2 // first two payouts executed
      })
    );
  }
  await Cycle.insertMany(cycles1);

  // --- GROUP 2: Randomized policy, intermediate state ---
  console.log('Creating Group 2 (randomized policy, intermediate)...');
  const startMonth2 = new Date();
  startMonth2.setMonth(startMonth2.getMonth() - 1); // 1 month ago
  startMonth2.setDate(1);

  const group2 = await Group.create({
    name: 'Group Random Demo',
    currency: 'INR',
    monthlyContribution: 1500,
    groupSize: 4,
    startMonth: startMonth2,
    paymentWindow: '5-10',
    penaltyRules: 'Demo random penalties',
    turnOrderPolicy: 'randomized',
    gracePeriodDays: 2,
    createdBy: org1._id,
    members: members.map((m, idx) => ({
      user: m._id,
      payoutAccount: `demo-account-${m.name}`,
      isActive: true,
      turnPosition: idx + 1
    }))
  });

  const cycles2 = [];
  for (let i = 0; i < group2.groupSize; i++) {
    const dueDate = buildDueDate(group2.startMonth, i);
    const payments = [];

    if (i === 0) {
      // first cycle: mem1, mem2 paid; mem3 late; mem4 pending
      payments.push(
        {
          member: mem1._id,
          paidAt: new Date(dueDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          amount: group2.monthlyContribution,
          penaltyAmount: 0,
          penaltyDays: 0,
          status: 'paid'
        },
        {
          member: mem2._id,
          paidAt: new Date(dueDate.getTime() + 6 * 24 * 60 * 60 * 1000),
          amount: group2.monthlyContribution,
          penaltyAmount: 150,
          penaltyDays: 2,
          status: 'paid'
        },
        {
          member: mem3._id,
          paidAt: null,
          amount: group2.monthlyContribution,
          penaltyAmount: 0,
          penaltyDays: 0,
          status: 'pending'
        }
      );
    } else if (i === 1) {
      // second cycle: only mem1 paid so far
      payments.push({
        member: mem1._id,
        paidAt: new Date(dueDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        amount: group2.monthlyContribution,
        penaltyAmount: 0,
        penaltyDays: 0,
        status: 'paid'
      });
    }

    cycles2.push(
      new Cycle({
        group: group2._id,
        monthIndex: i,
        dueDate,
        payments,
        payoutExecuted: false
      })
    );
  }
  await Cycle.insertMany(cycles2);

  // --- GROUP 3: Admin‑approval policy, early/intermediate ---
  console.log('Creating Group 3 (admin_approval policy, early stage)...');
  const startMonth3 = new Date();
  startMonth3.setMonth(startMonth3.getMonth()); // starts this month
  startMonth3.setDate(1);

  const group3 = await Group.create({
    name: 'Group Admin Approval Demo',
    currency: 'INR',
    monthlyContribution: 2500,
    groupSize: 4,
    startMonth: startMonth3,
    paymentWindow: '1-5',
    penaltyRules: 'Admin approval demo',
    turnOrderPolicy: 'admin_approval',
    gracePeriodDays: 0,
    createdBy: org1._id,
    members: members.map((m, idx) => ({
      user: m._id,
      payoutAccount: `demo-account-${m.name}`,
      isActive: true,
      turnPosition: idx + 1
    }))
  });

  const cycles3 = [];
  for (let i = 0; i < group3.groupSize; i++) {
    const dueDate = buildDueDate(group3.startMonth, i);
    const payments = [];

    if (i === 0) {
      // first cycle: mem1 submitted (pending approval), mem2 rejected once
      payments.push(
        {
          member: mem1._id,
          paidAt: new Date(dueDate.getTime() + 1 * 24 * 60 * 60 * 1000),
          amount: group3.monthlyContribution,
          penaltyAmount: 0,
          penaltyDays: 0,
          status: 'pending'
        },
        {
          member: mem2._id,
          paidAt: new Date(dueDate.getTime() + 2 * 24 * 60 * 60 * 1000),
          amount: group3.monthlyContribution,
          penaltyAmount: 0,
          penaltyDays: 0,
          status: 'rejected'
        }
      );
    }

    cycles3.push(
      new Cycle({
        group: group3._id,
        monthIndex: i,
        dueDate,
        payments,
        payoutExecuted: false
      })
    );
  }
  await Cycle.insertMany(cycles3);

  console.log('Seeding complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});


