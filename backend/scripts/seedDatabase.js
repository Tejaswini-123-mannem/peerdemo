// Script to seed the database with test data for all functionalities
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Group = require('../models/Group');
const Cycle = require('../models/Cycle');
const Invitation = require('../models/Invitation');
const Dispute = require('../models/Dispute');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/peer2loan';

// Helper function to get first day of month
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1);
}

// Helper function to get date after days
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');
    
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({});
    await Group.deleteMany({});
    await Cycle.deleteMany({});
    await Invitation.deleteMany({});
    await Dispute.deleteMany({});
    console.log('✅ Cleared existing data\n');

    // Create Admin/Organizer
    console.log('👤 Creating admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: hashedPassword,
      role: 'organizer',
      contactNumber: '+1234567890',
      emergencyContactName: 'Emergency Contact',
      emergencyContactNumber: '+1234567891',
      upiId: 'admin@upi'
    });
    console.log(`✅ Created admin: ${admin.email} (ID: ${admin._id})\n`);

    // Create Members
    console.log('👥 Creating member users...');
    const members = [];
    const memberData = [
      { name: 'Alice Johnson', email: 'alice@test.com', contact: '+1111111111', upi: 'alice@upi' },
      { name: 'Bob Smith', email: 'bob@test.com', contact: '+2222222222', upi: 'bob@upi' },
      { name: 'Charlie Brown', email: 'charlie@test.com', contact: '+3333333333', upi: 'charlie@upi' },
      { name: 'Diana Prince', email: 'diana@test.com', contact: '+4444444444', upi: 'diana@upi' },
      { name: 'Eve Wilson', email: 'eve@test.com', contact: '+5555555555', upi: 'eve@upi' },
      { name: 'Frank Miller', email: 'frank@test.com', contact: '+6666666666', upi: 'frank@upi' }
    ];

    for (const data of memberData) {
      const member = await User.create({
        name: data.name,
        email: data.email,
        password: hashedPassword, // Same password for all test users
        role: 'member',
        contactNumber: data.contact,
        emergencyContactName: 'Emergency',
        emergencyContactNumber: data.contact,
        upiId: data.upi
      });
      members.push(member);
      console.log(`  ✓ Created member: ${member.email}`);
    }
    console.log(`✅ Created ${members.length} members\n`);

    // Create Group 1: Fixed Turn Order
    console.log('📦 Creating Group 1: Fixed Turn Order...');
    const currentDate = new Date();
    const startMonth = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
    
    const plannedMembers1 = members.slice(0, 4).map((member, index) => ({
      name: member.name,
      email: member.email,
      user: member._id,
      position: index + 1
    }));

    const group1 = await Group.create({
      name: 'Fixed Order Group',
      monthlyContribution: 5000,
      groupSize: 4,
      startMonth: startMonth,
      paymentWindow: '1-7',
      gracePeriodDays: 2,
      currency: 'INR',
      turnOrderPolicy: 'fixed',
      createdBy: admin._id,
      plannedMembers: plannedMembers1,
      settings: {
        autoReminders: true,
        replacementPolicy: false
      }
    });

    // Add members to group
    for (let i = 0; i < 4; i++) {
      group1.members.push({
        user: members[i]._id,
        payoutAccount: `Account ${i + 1}`,
        turnPosition: i + 1
      });
    }
    await group1.save();

    // Create cycles for group 1
    for (let i = 0; i < 3; i++) {
      const cycleDate = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth() + i);
      const cycle = await Cycle.create({
        group: group1._id,
        monthIndex: i,
        dueDate: cycleDate,
        amount: 5000,
        windowStart: cycleDate,
        windowEnd: addDays(cycleDate, 6), // 1-7 window
        gracePeriodEnd: addDays(cycleDate, 8) // +2 grace period
      });

      // Add some payment records
      if (i === 0) {
        // First cycle: Some paid, some pending, some late
        const payment1 = {
          member: members[0]._id,
          amount: 5000,
          status: 'paid',
          paidAt: addDays(cycleDate, 2), // On time
          proofUrl: '/uploads/test-proof-1.png'
        };
        const payment2 = {
          member: members[1]._id,
          amount: 5000,
          status: 'pending',
          paidAt: addDays(cycleDate, 5),
          proofUrl: '/uploads/test-proof-2.png'
        };
        const payment3 = {
          member: members[2]._id,
          amount: 5000,
          status: 'paid',
          paidAt: addDays(cycleDate, 10), // Late (after grace period)
          proofUrl: '/uploads/test-proof-3.png',
          penaltyDays: 2,
          penaltyAmount: (5000 / 30) * 2 // amount/30 per day
        };
        cycle.payments = [payment1, payment2, payment3];
        cycle.payoutRecipient = members[0]._id; // First member gets payout
        cycle.payoutExecuted = true;
        cycle.payoutProof = '/uploads/payout-proof-1.png';
        await cycle.save();
      }
    }

    console.log(`✅ Created Group 1 with ${group1.members.length} members and 3 cycles\n`);

    // Create Group 2: Randomized Turn Order
    console.log('📦 Creating Group 2: Randomized Turn Order...');
    const plannedMembers2 = members.slice(2, 6).map((member, index) => ({
      name: member.name,
      email: member.email,
      user: member._id,
      position: index + 1
    }));

    const group2 = await Group.create({
      name: 'Randomized Order Group',
      monthlyContribution: 3000,
      groupSize: 4,
      startMonth: startMonth,
      paymentWindow: '1-15',
      gracePeriodDays: 3,
      currency: 'INR',
      turnOrderPolicy: 'randomized',
      createdBy: admin._id,
      plannedMembers: plannedMembers2,
      settings: {
        autoReminders: false,
        replacementPolicy: true
      }
    });

    // Add members to group
    for (let i = 2; i < 6; i++) {
      group2.members.push({
        user: members[i]._id,
        payoutAccount: `Account ${i + 1}`,
        turnPosition: i - 1
      });
    }
    await group2.save();

    // Create cycles for group 2
    for (let i = 0; i < 2; i++) {
      const cycleDate = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth() + i);
      const cycle = await Cycle.create({
        group: group2._id,
        monthIndex: i,
        dueDate: cycleDate,
        amount: 3000,
        windowStart: cycleDate,
        windowEnd: addDays(cycleDate, 14), // 1-15 window
        gracePeriodEnd: addDays(cycleDate, 17) // +3 grace period
      });

      if (i === 0) {
        // All payments on time
        cycle.payments = members.slice(2, 6).map((member, idx) => ({
          member: member._id,
          amount: 3000,
          status: 'paid',
          paidAt: addDays(cycleDate, idx + 1),
          proofUrl: `/uploads/test-proof-${idx + 4}.png`
        }));
        cycle.payoutRecipient = members[2]._id;
        cycle.payoutExecuted = true;
        await cycle.save();
      }
    }

    console.log(`✅ Created Group 2 with ${group2.members.length} members and 2 cycles\n`);

    // Create Group 3: Admin Approval
    console.log('📦 Creating Group 3: Admin Approval Policy...');
    const group3 = await Group.create({
      name: 'Admin Approval Group',
      monthlyContribution: 4000,
      groupSize: 3,
      startMonth: startMonth,
      paymentWindow: '1-10',
      gracePeriodDays: 1,
      currency: 'INR',
      turnOrderPolicy: 'admin_approval',
      createdBy: admin._id,
      settings: {
        autoReminders: true,
        replacementPolicy: true
      }
    });

    // Add members to group
    for (let i = 0; i < 3; i++) {
      group3.members.push({
        user: members[i]._id,
        payoutAccount: `Account ${i + 1}`
      });
    }
    await group3.save();

    // Create one cycle for group 3
    const cycleDate3 = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
    const cycle3 = await Cycle.create({
      group: group3._id,
      monthIndex: 0,
      dueDate: cycleDate3,
      amount: 4000,
      windowStart: cycleDate3,
      windowEnd: addDays(cycleDate3, 9), // 1-10 window
      gracePeriodEnd: addDays(cycleDate3, 10) // +1 grace period
    });
    cycle3.payoutRecipient = members[1]._id; // Assigned by admin
    await cycle3.save();

    console.log(`✅ Created Group 3 with ${group3.members.length} members\n`);

    // Create Disputes
    console.log('⚖️  Creating disputes...');
    const dispute1 = await Dispute.create({
      group: group1._id,
      raisedBy: members[0]._id,
      subject: 'Payment delay issue',
      messages: [{
        from: members[0]._id,
        message: 'I have a concern about the payment delay. Can you please clarify?',
        createdAt: new Date()
      }],
      status: 'open'
    });

    const dispute2 = await Dispute.create({
      group: group1._id,
      raisedBy: members[1]._id,
      subject: 'Payout clarification needed',
      messages: [
        {
          from: members[1]._id,
          message: 'When will I receive my payout?',
          createdAt: new Date()
        },
        {
          from: admin._id,
          message: 'Your payout will be processed by the end of this month.',
          createdAt: new Date()
        }
      ],
      status: 'open'
    });

    const dispute3 = await Dispute.create({
      group: group2._id,
      raisedBy: members[3]._id,
      subject: 'Resolved issue',
      messages: [
        {
          from: members[3]._id,
          message: 'I had an issue with my payment.',
          createdAt: new Date()
        },
        {
          from: admin._id,
          message: 'This has been resolved. Thank you for your patience.',
          createdAt: new Date()
        }
      ],
      status: 'resolved'
    });

    console.log(`✅ Created 3 disputes (2 open, 1 resolved)\n`);

    // Create Invitations
    console.log('📧 Creating invitations...');
    await Invitation.create({
      group: group1._id,
      email: 'newmember@test.com',
      turnPosition: 5,
      status: 'pending'
    });

    console.log('✅ Created 1 pending invitation\n');

    // Summary
    console.log('📊 Seeding Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Users: ${await User.countDocuments()} (1 admin, ${members.length} members)`);
    console.log(`✅ Groups: ${await Group.countDocuments()} (3 groups)`);
    console.log(`✅ Cycles: ${await Cycle.countDocuments()} (6 cycles)`);
    console.log(`✅ Disputes: ${await Dispute.countDocuments()} (3 disputes)`);
    console.log(`✅ Invitations: ${await Invitation.countDocuments()} (1 invitation)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🔑 Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Admin:');
    console.log('  Email: admin@test.com');
    console.log('  Password: admin123');
    console.log('\nMembers:');
    console.log('  alice@test.com / admin123');
    console.log('  bob@test.com / admin123');
    console.log('  charlie@test.com / admin123');
    console.log('  diana@test.com / admin123');
    console.log('  eve@test.com / admin123');
    console.log('  frank@test.com / admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Database seeding completed successfully!');
    console.log('You can now test all functionalities:\n');
    console.log('  • Penalties calculation');
    console.log('  • Performance analysis');
    console.log('  • Payout management');
    console.log('  • Payment cycles');
    console.log('  • Dispute resolution');
    console.log('  • Group settings');
    console.log('  • Grace period handling');
    console.log('  • Turn order policies\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();

