#!/usr/bin/env tsx

import { seedVariantTypes } from '../lib/seed-variant-types';

async function runSeed() {
  try {
    console.log('Starting to seed variant types and units of measurement...');
    await seedVariantTypes();
    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error running seed:', error);
    process.exit(1);
  }
}

runSeed();