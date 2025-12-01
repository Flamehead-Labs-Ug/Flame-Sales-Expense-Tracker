import { Pool } from 'pg';

export async function seedVariantTypes() {
  let pool: Pool | null = null;
  
  try {
    pool = new Pool({
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      port: parseInt(process.env.PG_PORT || '5432')
    });

    // Check if variant types already exist to avoid duplicates
    const checkResult = await pool.query('SELECT COUNT(*) FROM variant_types');
    const count = parseInt(checkResult.rows[0].count);

    if (count > 0) {
      console.log('Variant types already exist, skipping seed');
      return;
    }

    // Insert default variant types
    const variantTypes = [
      { id: 1, type_name: 'Size' },
      { id: 2, type_name: 'Volume' },
      { id: 3, type_name: 'Weight' },
      { id: 4, type_name: 'Color' },
      { id: 5, type_name: 'Length' },
      { id: 6, type_name: 'Width' },
      { id: 7, type_name: 'Height' },
      { id: 8, type_name: 'Diameter' },
      { id: 9, type_name: 'Count' },
      { id: 10, type_name: 'Temperature' }
    ];

    for (const variantType of variantTypes) {
      await pool.query(
        'INSERT INTO variant_types (id, type_name) VALUES ($1, $2)',
        [variantType.id, variantType.type_name]
      );
    }

    // Insert default units of measurement for each variant type
    const unitsOfMeasurement = [
      // Size units
      { variant_type_id: 1, unit_name: 'Small' },
      { variant_type_id: 1, unit_name: 'Medium' },
      { variant_type_id: 1, unit_name: 'Large' },
      { variant_type_id: 1, unit_name: 'Extra Large' },
      { variant_type_id: 1, unit_name: 'XXL' },
      { variant_type_id: 1, unit_name: 'XXXL' },
      
      // Volume units
      { variant_type_id: 2, unit_name: 'ml' },
      { variant_type_id: 2, unit_name: 'L' },
      { variant_type_id: 2, unit_name: 'cl' },
      { variant_type_id: 2, unit_name: 'gallons' },
      { variant_type_id: 2, unit_name: 'pints' },
      { variant_type_id: 2, unit_name: 'quarts' },
      
      // Weight units
      { variant_type_id: 3, unit_name: 'g' },
      { variant_type_id: 3, unit_name: 'kg' },
      { variant_type_id: 3, unit_name: 'mg' },
      { variant_type_id: 3, unit_name: 'lbs' },
      { variant_type_id: 3, unit_name: 'oz' },
      { variant_type_id: 3, unit_name: 'tons' },
      
      // Color units
      { variant_type_id: 4, unit_name: 'Red' },
      { variant_type_id: 4, unit_name: 'Blue' },
      { variant_type_id: 4, unit_name: 'Green' },
      { variant_type_id: 4, unit_name: 'Yellow' },
      { variant_type_id: 4, unit_name: 'Black' },
      { variant_type_id: 4, unit_name: 'White' },
      { variant_type_id: 4, unit_name: 'Purple' },
      { variant_type_id: 4, unit_name: 'Orange' },
      { variant_type_id: 4, unit_name: 'Pink' },
      { variant_type_id: 4, unit_name: 'Brown' },
      { variant_type_id: 4, unit_name: 'Gray' },
      { variant_type_id: 4, unit_name: 'Silver' },
      { variant_type_id: 4, unit_name: 'Gold' },
      { variant_type_id: 4, unit_name: 'Cyan' },
      { variant_type_id: 4, unit_name: 'Magenta' },
      
      // Length units
      { variant_type_id: 5, unit_name: 'mm' },
      { variant_type_id: 5, unit_name: 'cm' },
      { variant_type_id: 5, unit_name: 'm' },
      { variant_type_id: 5, unit_name: 'km' },
      { variant_type_id: 5, unit_name: 'inches' },
      { variant_type_id: 5, unit_name: 'feet' },
      { variant_type_id: 5, unit_name: 'yards' },
      
      // Width units
      { variant_type_id: 6, unit_name: 'mm' },
      { variant_type_id: 6, unit_name: 'cm' },
      { variant_type_id: 6, unit_name: 'm' },
      { variant_type_id: 6, unit_name: 'km' },
      { variant_type_id: 6, unit_name: 'inches' },
      { variant_type_id: 6, unit_name: 'feet' },
      
      // Height units
      { variant_type_id: 7, unit_name: 'mm' },
      { variant_type_id: 7, unit_name: 'cm' },
      { variant_type_id: 7, unit_name: 'm' },
      { variant_type_id: 7, unit_name: 'km' },
      { variant_type_id: 7, unit_name: 'inches' },
      { variant_type_id: 7, unit_name: 'feet' },
      
      // Diameter units
      { variant_type_id: 8, unit_name: 'mm' },
      { variant_type_id: 8, unit_name: 'cm' },
      { variant_type_id: 8, unit_name: 'm' },
      { variant_type_id: 8, unit_name: 'inches' },
      { variant_type_id: 8, unit_name: 'feet' },
      
      // Count units
      { variant_type_id: 9, unit_name: 'pieces' },
      { variant_type_id: 9, unit_name: 'packs' },
      { variant_type_id: 9, unit_name: 'boxes' },
      { variant_type_id: 9, unit_name: 'sets' },
      { variant_type_id: 9, unit_name: 'units' },
      { variant_type_id: 9, unit_name: 'dozen' },
      
      // Temperature units
      { variant_type_id: 10, unit_name: '°C' },
      { variant_type_id: 10, unit_name: '°F' },
      { variant_type_id: 10, unit_name: 'K' }
    ];

    for (const unit of unitsOfMeasurement) {
      await pool.query(
        'INSERT INTO units_of_measurement (variant_type_id, unit_name) VALUES ($1, $2)',
        [unit.variant_type_id, unit.unit_name]
      );
    }

    console.log('Successfully seeded variant types and units of measurement');
  } catch (error) {
    console.error('Error seeding variant types and units of measurement:', error);
    throw error;
 } finally {
    if (pool) await pool.end();
  }
}

if (require.main === module) {
  seedVariantTypes().catch(console.error);
}