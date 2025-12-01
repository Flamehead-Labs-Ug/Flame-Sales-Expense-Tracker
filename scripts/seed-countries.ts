#!/usr/bin/env tsx

import { seedCountries } from '../lib/seed-countries';

async function run() {
  try {
    console.log('Starting to seed countries...');
    await seedCountries();
    console.log('Country seeding completed successfully!');
  } catch (error) {
    console.error('Error running country seed:', error);
    process.exit(1);
  }
}

run();
