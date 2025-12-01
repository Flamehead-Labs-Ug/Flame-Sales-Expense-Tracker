#!/usr/bin/env tsx

import { seedVariantTypes } from '../lib/seed-variant-types';

async function testSeed() {
  try {
    console.log('Testing variant types seeding...');
    await seedVariantTypes();
    console.log('Test completed successfully! Variant types and units should now be available in the database.');
  } catch (error) {
    console.error('Error in test:', error);
    process.exit(1);
  }
}

testSeed();