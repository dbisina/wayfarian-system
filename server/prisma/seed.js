// Database Seed Script
// server/prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const { generateRandomString } = require('../utils/helpers');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.photo.deleteMany();
  await prisma.journey.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  // Create test users
  console.log('👤 Creating test users...');
  const users = await Promise.all([
    prisma.user.create({
      data: {
        firebaseUid: 'test_user_1',
        email: 'john.doe@example.com',
        displayName: 'John Doe',
        photoURL: 'https://i.pravatar.cc/150?img=1',
        phoneNumber: '+1234567890',
        totalDistance: 1250.5,
        totalTime: 45000,
        topSpeed: 145.5,
        totalTrips: 23,
      }
    }),
    prisma.user.create({
      data: {
        firebaseUid: 'test_user_2',
        email: 'jane.smith@example.com',
        displayName: 'Jane Smith',
        photoURL: 'https://i.pravatar.cc/150?img=2',
        phoneNumber: '+1234567891',
        totalDistance: 890.3,
        totalTime: 32000,
        topSpeed: 125.0,
        totalTrips: 15,
      }
    }),
    prisma.user.create({
      data: {
        firebaseUid: 'test_user_3',
        email: 'mike.wilson@example.com',
        displayName: 'Mike Wilson',
        photoURL: 'https://i.pravatar.cc/150?img=3',
        phoneNumber: '+1234567892',
        totalDistance: 2100.8,
        totalTime: 78000,
        topSpeed: 165.2,
        totalTrips: 42,
      }
    }),
    prisma.user.create({
      data: {
        firebaseUid: 'test_user_4',
        email: 'sarah.jones@example.com',
        displayName: 'Sarah Jones',
        photoURL: 'https://i.pravatar.cc/150?img=4',
        phoneNumber: '+1234567893',
        totalDistance: 567.2,
        totalTime: 21000,
        topSpeed: 110.5,
        totalTrips: 8,
      }
    }),
    prisma.user.create({
      data: {
        firebaseUid: 'test_user_5',
        email: 'tom.brown@example.com',
        displayName: 'Tom Brown',
        photoURL: 'https://i.pravatar.cc/150?img=5',
        phoneNumber: '+1234567894',
        totalDistance: 3456.9,
        totalTime: 125000,
        topSpeed: 178.3,
        totalTrips: 67,
      }
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // Create test groups
  console.log('👥 Creating test groups...');
  const groups = await Promise.all([
    prisma.group.create({
      data: {
        name: 'Weekend Warriors',
        description: 'For those who ride on weekends',
        code: 'WKND01',
        creatorId: users[0].id,
        maxMembers: 20,
        isActive: true,
        isPrivate: false,
      }
    }),
    prisma.group.create({
      data: {
        name: 'Speed Demons',
        description: 'High speed enthusiasts',
        code: 'SPEED1',
        creatorId: users[2].id,
        maxMembers: 15,
        isActive: true,
        isPrivate: false,
      }
    }),
    prisma.group.create({
      data: {
        name: 'Family Trips',
        description: 'Family-friendly journeys',
        code: 'FAM123',
        creatorId: users[1].id,
        maxMembers: 10,
        isActive: true,
        isPrivate: true,
      }
    }),
  ]);

  console.log(`✅ Created ${groups.length} groups`);

  // Add members to groups
  console.log('🤝 Adding group members...');
  await Promise.all([
    // Weekend Warriors members
    prisma.groupMember.create({
      data: {
        userId: users[0].id,
        groupId: groups[0].id,
        role: 'CREATOR',
      }
    }),
    prisma.groupMember.create({
      data: {
        userId: users[1].id,
        groupId: groups[0].id,
        role: 'ADMIN',
      }
    }),
    prisma.groupMember.create({
      data: {
        userId: users[3].id,
        groupId: groups[0].id,
        role: 'MEMBER',
      }
    }),
    // Speed Demons members
    prisma.groupMember.create({
      data: {
        userId: users[2].id,
        groupId: groups[1].id,
        role: 'CREATOR',
      }
    }),
    prisma.groupMember.create({
      data: {
        userId: users[4].id,
        groupId: groups[1].id,
        role: 'MEMBER',
      }
    }),
    prisma.groupMember.create({
      data: {
        userId: users[0].id,
        groupId: groups[1].id,
        role: 'MEMBER',
      }
    }),
    // Family Trips members
    prisma.groupMember.create({
      data: {
        userId: users[1].id,
        groupId: groups[2].id,
        role: 'CREATOR',
      }
    }),
    prisma.groupMember.create({
      data: {
        userId: users[3].id,
        groupId: groups[2].id,
        role: 'MEMBER',
      }
    }),
  ]);

  console.log('✅ Added group members');

  // Create test journeys
  console.log('🚗 Creating test journeys...');
  const journeys = await Promise.all([
    prisma.journey.create({
      data: {
        userId: users[0].id,
        title: 'Morning Commute',
        startTime: new Date('2024-01-15T08:00:00'),
        endTime: new Date('2024-01-15T08:45:00'),
        status: 'COMPLETED',
        totalDistance: 45.2,
        totalTime: 2700,
        avgSpeed: 60.3,
        topSpeed: 85.5,
        startLatitude: 40.7128,
        startLongitude: -74.0060,
        endLatitude: 40.7580,
        endLongitude: -73.9855,
        vehicle: 'car',
        groupId: groups[0].id,
        routePoints: [
          { lat: 40.7128, lng: -74.0060, timestamp: '2024-01-15T08:00:00', speed: 0 },
          { lat: 40.7250, lng: -74.0020, timestamp: '2024-01-15T08:15:00', speed: 55 },
          { lat: 40.7400, lng: -73.9950, timestamp: '2024-01-15T08:30:00', speed: 65 },
          { lat: 40.7580, lng: -73.9855, timestamp: '2024-01-15T08:45:00', speed: 0 },
        ],
      }
    }),
    prisma.journey.create({
      data: {
        userId: users[2].id,
        title: 'Weekend Canyon Run',
        startTime: new Date('2024-01-14T06:00:00'),
        endTime: new Date('2024-01-14T08:30:00'),
        status: 'COMPLETED',
        totalDistance: 156.8,
        totalTime: 9000,
        avgSpeed: 75.8,
        topSpeed: 145.2,
        startLatitude: 34.0522,
        startLongitude: -118.2437,
        endLatitude: 34.1425,
        endLongitude: -118.2551,
        vehicle: 'motorcycle',
        groupId: groups[1].id,
      }
    }),
    prisma.journey.create({
      data: {
        userId: users[1].id,
        title: 'Family Road Trip',
        startTime: new Date('2024-01-13T10:00:00'),
        endTime: new Date('2024-01-13T14:30:00'),
        status: 'COMPLETED',
        totalDistance: 235.5,
        totalTime: 16200,
        avgSpeed: 52.3,
        topSpeed: 95.0,
        startLatitude: 37.7749,
        startLongitude: -122.4194,
        endLatitude: 36.7783,
        endLongitude: -119.4179,
        vehicle: 'car',
        groupId: groups[2].id,
      }
    }),
    prisma.journey.create({
      data: {
        userId: users[0].id,
        title: 'Current Journey',
        startTime: new Date(),
        status: 'ACTIVE',
        totalDistance: 12.3,
        totalTime: 900,
        avgSpeed: 49.2,
        topSpeed: 65.0,
        startLatitude: 40.7128,
        startLongitude: -74.0060,
        vehicle: 'bike',
      }
    }),
  ]);

  console.log(`✅ Created ${journeys.length} journeys`);

  // Create test photos
  console.log('📸 Creating test photos...');
  const photos = await Promise.all([
    prisma.photo.create({
      data: {
        userId: users[0].id,
        journeyId: journeys[0].id,
        filename: 'photo_001.jpg',
        originalName: 'sunset_drive.jpg',
        firebasePath: `users/${users[0].id}/photos/photo_001.jpg`,
        thumbnailPath: `users/${users[0].id}/photos/thumbnails/thumb_photo_001.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 2048576,
        latitude: 40.7250,
        longitude: -74.0020,
        takenAt: new Date('2024-01-15T08:15:00'),
        isProcessed: true,
      }
    }),
    prisma.photo.create({
      data: {
        userId: users[2].id,
        journeyId: journeys[1].id,
        filename: 'photo_002.jpg',
        originalName: 'canyon_view.jpg',
        firebasePath: `users/${users[2].id}/photos/photo_002.jpg`,
        thumbnailPath: `users/${users[2].id}/photos/thumbnails/thumb_photo_002.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 3145728,
        latitude: 34.0952,
        longitude: -118.2500,
        takenAt: new Date('2024-01-14T07:00:00'),
        isProcessed: true,
      }
    }),
    prisma.photo.create({
      data: {
        userId: users[1].id,
        journeyId: journeys[2].id,
        filename: 'photo_003.jpg',
        originalName: 'rest_stop.jpg',
        firebasePath: `users/${users[1].id}/photos/photo_003.jpg`,
        thumbnailPath: `users/${users[1].id}/photos/thumbnails/thumb_photo_003.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 1572864,
        latitude: 37.2783,
        longitude: -120.9179,
        takenAt: new Date('2024-01-13T12:00:00'),
        isProcessed: true,
      }
    }),
  ]);

  console.log(`✅ Created ${photos.length} photos`);

  console.log('🎉 Database seeding completed successfully!');
  
  // Display summary
  console.log('\n📊 Summary:');
  console.log(`- Users: ${users.length}`);
  console.log(`- Groups: ${groups.length}`);
  console.log(`- Journeys: ${journeys.length}`);
  console.log(`- Photos: ${photos.length}`);
  
  console.log('\n🔑 Test User Credentials:');
  users.forEach(user => {
    console.log(`- ${user.displayName}: ${user.email}`);
  });
  
  console.log('\n📱 Group Join Codes:');
  groups.forEach(group => {
    console.log(`- ${group.name}: ${group.code}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });