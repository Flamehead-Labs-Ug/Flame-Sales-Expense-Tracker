#!/usr/bin/env tsx

import { seedCurrencies } from '../lib/seed-currencies';

async function run() {
  try {
    console.log('Starting to seed currencies from exchange-api...');
    await seedCurrencies();
    console.log('Currency seeding completed successfully!');
  } catch (error) {
    console.error('Error running currency seed:', error);
    process.exit(1);
  }
}

run();
