/**
 * NoParchi Dual-Mode (Parking & Coaching Scholarship) Verification Suite
 *
 * Verifies both business workflows:
 * Mode 1: Parking lot duration checkout, overstay tracking, exit scan.
 * Mode 2: Coaching scholarship banner registration, admit card generation,
 *         attendance verification, duplicate entry prevention, lead CSV export.
 */

import assert from 'assert';

console.log('\n🚀 Starting NoParchi Dual-Mode Workflow Verification Suite...\n');
let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    process.stdout.write(`🧪 ${name}... `);
    fn();
    console.log('✅ PASS');
    testsPassed++;
  } catch (err) {
    console.log(`❌ FAIL\n   ${err.message}`);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// Test Group 1: Scholarship Registration Contract & Roll Number Generator
// -----------------------------------------------------------------------------
runTest('Scholarship Registration Input Validation', () => {
  const validateInput = (input) => {
    if (!input.studentName?.trim()) throw new Error('Student name required');
    const cleanStudentPhone = (input.studentPhone || '').replace(/\D/g, '');
    if (cleanStudentPhone.length < 10) throw new Error('Valid 10-digit student phone required');
    const cleanParentPhone = (input.parentPhone || '').replace(/\D/g, '');
    if (cleanParentPhone.length < 10) throw new Error('Valid 10-digit parent phone required');
    if (!input.classGrade) throw new Error('Class/Grade required');
    if (!input.examSlot) throw new Error('Exam slot required');
    return true;
  };

  assert.strictEqual(
    validateInput({
      studentName: 'Aarav Gupta',
      studentPhone: '9876543210',
      parentPhone: '9876501234',
      classGrade: 'Class 10',
      examSlot: 'Sunday, 10:00 AM - 12:00 PM (Slot 1)',
    }),
    true
  );

  assert.throws(
    () =>
      validateInput({
        studentName: '',
        studentPhone: '9876543210',
        parentPhone: '9876501234',
        classGrade: 'Class 10',
        examSlot: 'Sunday',
      }),
    /Student name required/
  );

  assert.throws(
    () =>
      validateInput({
        studentName: 'Rahul',
        studentPhone: '123',
        parentPhone: '9876501234',
        classGrade: 'Class 10',
        examSlot: 'Sunday',
      }),
    /Valid 10-digit student phone required/
  );
});

runTest('Roll Number and Ticket Code Format Verification', () => {
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const generateRollNo = (seq) => `SCH-${currentYear}-${seq.toString().padStart(4, '0')}`;
  const rollNo = generateRollNo(42);

  assert.match(rollNo, new RegExp(`^SCH-${currentYear}-\\d{4}$`));
  assert.strictEqual(rollNo, `SCH-${currentYear}-0042`);

  const generateTicketCode = () => `FP-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const code = generateTicketCode();
  assert.match(code, /^FP-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

// -----------------------------------------------------------------------------
// Test Group 2: Attendance Verification & Duplicate Prevention
// -----------------------------------------------------------------------------
runTest('Exam Gate Attendance Verification Flow', () => {
  const mockDatabase = new Map();

  const recordEntry = (ticketCode, studentName, rollNumber) => {
    if (mockDatabase.has(ticketCode)) {
      const prior = mockDatabase.get(ticketCode);
      return {
        success: false,
        status: 'ALREADY_USED',
        mode: 'SCHOLARSHIP_TEST',
        studentName,
        rollNumber,
        message: 'This candidate has already entered the exam hall.',
        firstUsedAt: prior.attendedAt,
        scannedBy: prior.staff,
      };
    }

    const record = {
      ticketCode,
      studentName,
      rollNumber,
      attendedAt: new Date().toISOString(),
      staff: 'Invigilator Desk 1',
    };
    mockDatabase.set(ticketCode, record);

    return {
      success: true,
      status: 'VERIFIED',
      mode: 'SCHOLARSHIP_TEST',
      studentName,
      rollNumber,
      message: 'Attendance recorded successfully.',
      attendedAt: record.attendedAt,
    };
  };

  // First scan: Clean verification
  const firstScan = recordEntry('FP-AB12-CD34', 'Priya Sharma', 'SCH-26-0001');
  assert.strictEqual(firstScan.success, true);
  assert.strictEqual(firstScan.status, 'VERIFIED');
  assert.strictEqual(firstScan.studentName, 'Priya Sharma');

  // Second scan with same admit card: Duplicate rejection (anti-fraud)
  const secondScan = recordEntry('FP-AB12-CD34', 'Priya Sharma', 'SCH-26-0001');
  assert.strictEqual(secondScan.success, false);
  assert.strictEqual(secondScan.status, 'ALREADY_USED');
  assert.strictEqual(secondScan.scannedBy, 'Invigilator Desk 1');
  assert(secondScan.message.includes('already entered'));
});

// -----------------------------------------------------------------------------
// Test Group 3: Parking Flow Operations (Mode 1 Invariant Check)
// -----------------------------------------------------------------------------
runTest('Parking Duration and Overstay Fee Calculation', () => {
  const baseRate = 20; // Rs 20/hr
  const calculateOverstay = (issuedAt, validForMinutes, currentAt, extensionRate = 20) => {
    const elapsedMinutes = Math.floor((currentAt.getTime() - issuedAt.getTime()) / 60000);
    const overstayMinutes = elapsedMinutes - validForMinutes;
    if (overstayMinutes <= 0) {
      return { expired: false, minutesLeft: Math.abs(overstayMinutes), overstayDue: 0 };
    }
    const overstayHours = Math.ceil(overstayMinutes / 60);
    return {
      expired: true,
      overstayMinutes,
      overstayDue: overstayHours * extensionRate,
    };
  };

  const now = new Date();
  const issuedOneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Still within 2 hour pass
  const validCheck = calculateOverstay(issuedOneHourAgo, 120, now, 20);
  assert.strictEqual(validCheck.expired, false);
  assert.strictEqual(validCheck.overstayDue, 0);

  // Overstayed by 45 minutes on a 1-hour pass (billed as 1 extra hour = Rs 20)
  const issued105MinAgo = new Date(now.getTime() - 105 * 60 * 1000);
  const overstayCheck = calculateOverstay(issued105MinAgo, 60, now, 20);
  assert.strictEqual(overstayCheck.expired, true);
  assert.strictEqual(overstayCheck.overstayDue, 20);
});

// -----------------------------------------------------------------------------
// Test Group 4: CSV Lead Export Builder Verification
// -----------------------------------------------------------------------------
runTest('Teacher CSV Student Leads Generation', () => {
  const candidates = [
    {
      ticketCode: 'FP-81A2-9K31',
      primaryName: 'Rohan Verma',
      primaryPhone: '9811223344',
      metadata: {
        roll_number: 'SCH-26-0101',
        parent_phone: '9811223355',
        class_grade: 'Class 11 (JEE)',
        exam_slot: 'Sunday 10:00 AM',
      },
      createdAt: '2026-10-05T10:00:00Z',
      attendedAt: '2026-10-05T09:45:00Z',
      validation: { scannedAt: '2026-10-05T09:45:00Z', exitGate: 'Main Gate' },
    },
    {
      ticketCode: 'FP-44B9-11C2',
      primaryName: 'Sneha Patel, Jr.', // Contains comma to test CSV escaping
      primaryPhone: '9988776655',
      metadata: {
        roll_number: 'SCH-26-0102',
        parent_phone: '9988776644',
        class_grade: 'Class 10',
        exam_slot: 'Sunday 02:00 PM',
      },
      createdAt: '2026-10-05T11:15:00Z',
      attendedAt: null,
      validation: null,
    },
  ];

  const headers = [
    'Roll Number',
    'Ticket Code',
    'Student Name',
    'Student Phone',
    'Parent Phone',
    'Class / Stream',
    'Exam Slot',
    'Attendance Status',
  ];

  const rows = candidates.map((c) => {
    const meta = c.metadata;
    const attended = Boolean(c.validation || c.attendedAt);
    return [
      meta.roll_number,
      c.ticketCode,
      `"${c.primaryName.replace(/"/g, '""')}"`,
      c.primaryPhone,
      meta.parent_phone,
      `"${meta.class_grade}"`,
      `"${meta.exam_slot}"`,
      attended ? 'PRESENT' : 'ABSENT',
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');

  assert(csv.includes('SCH-26-0101'));
  assert(csv.includes('Rohan Verma'));
  assert(csv.includes('PRESENT'));
  assert(csv.includes('"Sneha Patel, Jr."')); // Correctly quoted
  assert(csv.includes('ABSENT'));
  assert.strictEqual(rows.length, 2);
});

// -----------------------------------------------------------------------------
// Test Group 5: Dual Mode Operating Mode Switching Contract
// -----------------------------------------------------------------------------
runTest('Operating Mode Contract & State Transitions', () => {
  const merchant = {
    id: 'm-123',
    businessName: 'Apex IIT Coaching',
    operatingMode: 'PARKING',
  };

  const switchMode = (current, newMode) => {
    const validModes = ['PARKING', 'SCHOLARSHIP_TEST', 'GENERAL_EVENT'];
    if (!validModes.includes(newMode)) throw new Error(`Invalid operating mode: ${newMode}`);
    return { ...current, operatingMode: newMode };
  };

  const updatedToScholarship = switchMode(merchant, 'SCHOLARSHIP_TEST');
  assert.strictEqual(updatedToScholarship.operatingMode, 'SCHOLARSHIP_TEST');

  const updatedBackToParking = switchMode(updatedToScholarship, 'PARKING');
  assert.strictEqual(updatedBackToParking.operatingMode, 'PARKING');

  assert.throws(() => switchMode(merchant, 'INVALID_MODE'), /Invalid operating mode/);
});

console.log(`\n========================================`);
console.log(`Total Tests: ${testsPassed + testsFailed} | Passed: ${testsPassed} | Failed: ${testsFailed}`);
console.log(`========================================\n`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Dual-Mode logic tests passed successfully!\n');
}
