import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

function loadLocalEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) return;

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.warn('Failed to load .env.local for seed-countries:', err);
  }
}

interface CountrySeed {
  code: string;
  name: string;
  currencyCode: string | null;
}

const COUNTRIES: CountrySeed[] = [
  { code: 'AF', name: 'Afghanistan', currencyCode: 'AFN' },
  { code: 'AL', name: 'Albania', currencyCode: 'ALL' },
  { code: 'DZ', name: 'Algeria', currencyCode: 'DZD' },
  { code: 'AS', name: 'American Samoa', currencyCode: 'USD' },
  { code: 'AD', name: 'Andorra', currencyCode: 'EUR' },
  { code: 'AO', name: 'Angola', currencyCode: 'AOA' },
  { code: 'AI', name: 'Anguilla', currencyCode: 'XCD' },
  { code: 'AQ', name: 'Antarctica', currencyCode: null },
  { code: 'AG', name: 'Antigua and Barbuda', currencyCode: 'XCD' },
  { code: 'AR', name: 'Argentina', currencyCode: 'ARS' },
  { code: 'AM', name: 'Armenia', currencyCode: 'AMD' },
  { code: 'AW', name: 'Aruba', currencyCode: 'AWG' },
  { code: 'AU', name: 'Australia', currencyCode: 'AUD' },
  { code: 'AT', name: 'Austria', currencyCode: 'EUR' },
  { code: 'AZ', name: 'Azerbaijan', currencyCode: 'AZN' },
  { code: 'BS', name: 'Bahamas', currencyCode: 'BSD' },
  { code: 'BH', name: 'Bahrain', currencyCode: 'BHD' },
  { code: 'BD', name: 'Bangladesh', currencyCode: 'BDT' },
  { code: 'BB', name: 'Barbados', currencyCode: 'BBD' },
  { code: 'BY', name: 'Belarus', currencyCode: 'BYN' },
  { code: 'BE', name: 'Belgium', currencyCode: 'EUR' },
  { code: 'BZ', name: 'Belize', currencyCode: 'BZD' },
  { code: 'BJ', name: 'Benin', currencyCode: 'XOF' },
  { code: 'BM', name: 'Bermuda', currencyCode: 'BMD' },
  { code: 'BT', name: 'Bhutan', currencyCode: 'BTN' },
  { code: 'BO', name: 'Bolivia (Plurinational State of)', currencyCode: 'BOB' },
  { code: 'BQ', name: 'Bonaire, Sint Eustatius and Saba', currencyCode: 'USD' },
  { code: 'BA', name: 'Bosnia and Herzegovina', currencyCode: 'BAM' },
  { code: 'BW', name: 'Botswana', currencyCode: 'BWP' },
  { code: 'BV', name: 'Bouvet Island', currencyCode: 'NOK' },
  { code: 'BR', name: 'Brazil', currencyCode: 'BRL' },
  { code: 'IO', name: 'British Indian Ocean Territory', currencyCode: 'USD' },
  { code: 'BN', name: 'Brunei Darussalam', currencyCode: 'BND' },
  { code: 'BG', name: 'Bulgaria', currencyCode: 'BGN' },
  { code: 'BF', name: 'Burkina Faso', currencyCode: 'XOF' },
  { code: 'BI', name: 'Burundi', currencyCode: 'BIF' },
  { code: 'CV', name: 'Cabo Verde', currencyCode: 'CVE' },
  { code: 'KH', name: 'Cambodia', currencyCode: 'KHR' },
  { code: 'CM', name: 'Cameroon', currencyCode: 'XAF' },
  { code: 'CA', name: 'Canada', currencyCode: 'CAD' },
  { code: 'KY', name: 'Cayman Islands', currencyCode: 'KYD' },
  { code: 'CF', name: 'Central African Republic', currencyCode: 'XAF' },
  { code: 'TD', name: 'Chad', currencyCode: 'XAF' },
  { code: 'CL', name: 'Chile', currencyCode: 'CLP' },
  { code: 'CN', name: 'China', currencyCode: 'CNY' },
  { code: 'CX', name: 'Christmas Island', currencyCode: 'AUD' },
  { code: 'CC', name: 'Cocos (Keeling) Islands', currencyCode: 'AUD' },
  { code: 'CO', name: 'Colombia', currencyCode: 'COP' },
  { code: 'KM', name: 'Comoros', currencyCode: 'KMF' },
  { code: 'CG', name: 'Congo', currencyCode: 'XAF' },
  { code: 'CD', name: 'Congo, Democratic Republic of the', currencyCode: 'CDF' },
  { code: 'CK', name: 'Cook Islands', currencyCode: 'NZD' },
  { code: 'CR', name: 'Costa Rica', currencyCode: 'CRC' },
  { code: 'CI', name: "Côte d'Ivoire", currencyCode: 'XOF' },
  { code: 'HR', name: 'Croatia', currencyCode: 'EUR' },
  { code: 'CU', name: 'Cuba', currencyCode: 'CUP' },
  { code: 'CW', name: 'Curaçao', currencyCode: 'ANG' },
  { code: 'CY', name: 'Cyprus', currencyCode: 'EUR' },
  { code: 'CZ', name: 'Czechia', currencyCode: 'CZK' },
  { code: 'DK', name: 'Denmark', currencyCode: 'DKK' },
  { code: 'DJ', name: 'Djibouti', currencyCode: 'DJF' },
  { code: 'DM', name: 'Dominica', currencyCode: 'XCD' },
  { code: 'DO', name: 'Dominican Republic', currencyCode: 'DOP' },
  { code: 'EC', name: 'Ecuador', currencyCode: 'USD' },
  { code: 'EG', name: 'Egypt', currencyCode: 'EGP' },
  { code: 'SV', name: 'El Salvador', currencyCode: 'USD' },
  { code: 'GQ', name: 'Equatorial Guinea', currencyCode: 'XAF' },
  { code: 'ER', name: 'Eritrea', currencyCode: 'ERN' },
  { code: 'EE', name: 'Estonia', currencyCode: 'EUR' },
  { code: 'SZ', name: 'Eswatini', currencyCode: 'SZL' },
  { code: 'ET', name: 'Ethiopia', currencyCode: 'ETB' },
  { code: 'FK', name: 'Falkland Islands (Malvinas)', currencyCode: 'FKP' },
  { code: 'FO', name: 'Faroe Islands', currencyCode: 'DKK' },
  { code: 'FJ', name: 'Fiji', currencyCode: 'FJD' },
  { code: 'FI', name: 'Finland', currencyCode: 'EUR' },
  { code: 'FR', name: 'France', currencyCode: 'EUR' },
  { code: 'GF', name: 'French Guiana', currencyCode: 'EUR' },
  { code: 'PF', name: 'French Polynesia', currencyCode: 'XPF' },
  { code: 'TF', name: 'French Southern Territories', currencyCode: 'EUR' },
  { code: 'GA', name: 'Gabon', currencyCode: 'XAF' },
  { code: 'GM', name: 'Gambia', currencyCode: 'GMD' },
  { code: 'GE', name: 'Georgia', currencyCode: 'GEL' },
  { code: 'DE', name: 'Germany', currencyCode: 'EUR' },
  { code: 'GH', name: 'Ghana', currencyCode: 'GHS' },
  { code: 'GI', name: 'Gibraltar', currencyCode: 'GIP' },
  { code: 'GR', name: 'Greece', currencyCode: 'EUR' },
  { code: 'GL', name: 'Greenland', currencyCode: 'DKK' },
  { code: 'GD', name: 'Grenada', currencyCode: 'XCD' },
  { code: 'GP', name: 'Guadeloupe', currencyCode: 'EUR' },
  { code: 'GU', name: 'Guam', currencyCode: 'USD' },
  { code: 'GT', name: 'Guatemala', currencyCode: 'GTQ' },
  { code: 'GG', name: 'Guernsey', currencyCode: 'GBP' },
  { code: 'GN', name: 'Guinea', currencyCode: 'GNF' },
  { code: 'GW', name: 'Guinea-Bissau', currencyCode: 'XOF' },
  { code: 'GY', name: 'Guyana', currencyCode: 'GYD' },
  { code: 'HT', name: 'Haiti', currencyCode: 'HTG' },
  { code: 'HM', name: 'Heard Island and McDonald Islands', currencyCode: 'AUD' },
  { code: 'VA', name: 'Holy See', currencyCode: 'EUR' },
  { code: 'HN', name: 'Honduras', currencyCode: 'HNL' },
  { code: 'HK', name: 'Hong Kong', currencyCode: 'HKD' },
  { code: 'HU', name: 'Hungary', currencyCode: 'HUF' },
  { code: 'IS', name: 'Iceland', currencyCode: 'ISK' },
  { code: 'IN', name: 'India', currencyCode: 'INR' },
  { code: 'ID', name: 'Indonesia', currencyCode: 'IDR' },
  { code: 'IR', name: 'Iran (Islamic Republic of)', currencyCode: 'IRR' },
  { code: 'IQ', name: 'Iraq', currencyCode: 'IQD' },
  { code: 'IE', name: 'Ireland', currencyCode: 'EUR' },
  { code: 'IM', name: 'Isle of Man', currencyCode: 'GBP' },
  { code: 'IL', name: 'Israel', currencyCode: 'ILS' },
  { code: 'IT', name: 'Italy', currencyCode: 'EUR' },
  { code: 'JM', name: 'Jamaica', currencyCode: 'JMD' },
  { code: 'JP', name: 'Japan', currencyCode: 'JPY' },
  { code: 'JE', name: 'Jersey', currencyCode: 'GBP' },
  { code: 'JO', name: 'Jordan', currencyCode: 'JOD' },
  { code: 'KZ', name: 'Kazakhstan', currencyCode: 'KZT' },
  { code: 'KE', name: 'Kenya', currencyCode: 'KES' },
  { code: 'KI', name: 'Kiribati', currencyCode: 'AUD' },
  { code: 'KP', name: "Korea (Democratic People's Republic of)", currencyCode: 'KPW' },
  { code: 'KR', name: 'Korea, Republic of', currencyCode: 'KRW' },
  { code: 'KW', name: 'Kuwait', currencyCode: 'KWD' },
  { code: 'KG', name: 'Kyrgyzstan', currencyCode: 'KGS' },
  { code: 'LA', name: "Lao People's Democratic Republic", currencyCode: 'LAK' },
  { code: 'LV', name: 'Latvia', currencyCode: 'EUR' },
  { code: 'LB', name: 'Lebanon', currencyCode: 'LBP' },
  { code: 'LS', name: 'Lesotho', currencyCode: 'LSL' },
  { code: 'LR', name: 'Liberia', currencyCode: 'LRD' },
  { code: 'LY', name: 'Libya', currencyCode: 'LYD' },
  { code: 'LI', name: 'Liechtenstein', currencyCode: 'CHF' },
  { code: 'LT', name: 'Lithuania', currencyCode: 'EUR' },
  { code: 'LU', name: 'Luxembourg', currencyCode: 'EUR' },
  { code: 'MO', name: 'Macao', currencyCode: 'MOP' },
  { code: 'MG', name: 'Madagascar', currencyCode: 'MGA' },
  { code: 'MW', name: 'Malawi', currencyCode: 'MWK' },
  { code: 'MY', name: 'Malaysia', currencyCode: 'MYR' },
  { code: 'MV', name: 'Maldives', currencyCode: 'MVR' },
  { code: 'ML', name: 'Mali', currencyCode: 'XOF' },
  { code: 'MT', name: 'Malta', currencyCode: 'EUR' },
  { code: 'MH', name: 'Marshall Islands', currencyCode: 'USD' },
  { code: 'MQ', name: 'Martinique', currencyCode: 'EUR' },
  { code: 'MR', name: 'Mauritania', currencyCode: 'MRU' },
  { code: 'MU', name: 'Mauritius', currencyCode: 'MUR' },
  { code: 'YT', name: 'Mayotte', currencyCode: 'EUR' },
  { code: 'MX', name: 'Mexico', currencyCode: 'MXN' },
  { code: 'FM', name: 'Micronesia (Federated States of)', currencyCode: 'USD' },
  { code: 'MD', name: 'Moldova, Republic of', currencyCode: 'MDL' },
  { code: 'MC', name: 'Monaco', currencyCode: 'EUR' },
  { code: 'MN', name: 'Mongolia', currencyCode: 'MNT' },
  { code: 'ME', name: 'Montenegro', currencyCode: 'EUR' },
  { code: 'MS', name: 'Montserrat', currencyCode: 'XCD' },
  { code: 'MA', name: 'Morocco', currencyCode: 'MAD' },
  { code: 'MZ', name: 'Mozambique', currencyCode: 'MZN' },
  { code: 'MM', name: 'Myanmar', currencyCode: 'MMK' },
  { code: 'NA', name: 'Namibia', currencyCode: 'NAD' },
  { code: 'NR', name: 'Nauru', currencyCode: 'AUD' },
  { code: 'NP', name: 'Nepal', currencyCode: 'NPR' },
  { code: 'NL', name: 'Netherlands', currencyCode: 'EUR' },
  { code: 'NC', name: 'New Caledonia', currencyCode: 'XPF' },
  { code: 'NZ', name: 'New Zealand', currencyCode: 'NZD' },
  { code: 'NI', name: 'Nicaragua', currencyCode: 'NIO' },
  { code: 'NE', name: 'Niger', currencyCode: 'XOF' },
  { code: 'NG', name: 'Nigeria', currencyCode: 'NGN' },
  { code: 'NU', name: 'Niue', currencyCode: 'NZD' },
  { code: 'NF', name: 'Norfolk Island', currencyCode: 'AUD' },
  { code: 'MK', name: 'North Macedonia', currencyCode: 'MKD' },
  { code: 'MP', name: 'Northern Mariana Islands', currencyCode: 'USD' },
  { code: 'NO', name: 'Norway', currencyCode: 'NOK' },
  { code: 'OM', name: 'Oman', currencyCode: 'OMR' },
  { code: 'PK', name: 'Pakistan', currencyCode: 'PKR' },
  { code: 'PW', name: 'Palau', currencyCode: 'USD' },
  { code: 'PS', name: 'Palestine, State of', currencyCode: 'ILS' },
  { code: 'PA', name: 'Panama', currencyCode: 'PAB' },
  { code: 'PG', name: 'Papua New Guinea', currencyCode: 'PGK' },
  { code: 'PY', name: 'Paraguay', currencyCode: 'PYG' },
  { code: 'PE', name: 'Peru', currencyCode: 'PEN' },
  { code: 'PH', name: 'Philippines', currencyCode: 'PHP' },
  { code: 'PN', name: 'Pitcairn', currencyCode: 'NZD' },
  { code: 'PL', name: 'Poland', currencyCode: 'PLN' },
  { code: 'PT', name: 'Portugal', currencyCode: 'EUR' },
  { code: 'PR', name: 'Puerto Rico', currencyCode: 'USD' },
  { code: 'QA', name: 'Qatar', currencyCode: 'QAR' },
  { code: 'RE', name: 'Réunion', currencyCode: 'EUR' },
  { code: 'RO', name: 'Romania', currencyCode: 'RON' },
  { code: 'RU', name: 'Russian Federation', currencyCode: 'RUB' },
  { code: 'RW', name: 'Rwanda', currencyCode: 'RWF' },
  { code: 'BL', name: 'Saint Barthélemy', currencyCode: 'EUR' },
  { code: 'SH', name: 'Saint Helena, Ascension and Tristan da Cunha', currencyCode: 'SHP' },
  { code: 'KN', name: 'Saint Kitts and Nevis', currencyCode: 'XCD' },
  { code: 'LC', name: 'Saint Lucia', currencyCode: 'XCD' },
  { code: 'MF', name: 'Saint Martin (French part)', currencyCode: 'EUR' },
  { code: 'PM', name: 'Saint Pierre and Miquelon', currencyCode: 'EUR' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', currencyCode: 'XCD' },
  { code: 'WS', name: 'Samoa', currencyCode: 'WST' },
  { code: 'SM', name: 'San Marino', currencyCode: 'EUR' },
  { code: 'ST', name: 'Sao Tome and Principe', currencyCode: 'STN' },
  { code: 'SA', name: 'Saudi Arabia', currencyCode: 'SAR' },
  { code: 'SN', name: 'Senegal', currencyCode: 'XOF' },
  { code: 'RS', name: 'Serbia', currencyCode: 'RSD' },
  { code: 'SC', name: 'Seychelles', currencyCode: 'SCR' },
  { code: 'SL', name: 'Sierra Leone', currencyCode: 'SLE' },
  { code: 'SG', name: 'Singapore', currencyCode: 'SGD' },
  { code: 'SX', name: 'Sint Maarten (Dutch part)', currencyCode: 'ANG' },
  { code: 'SK', name: 'Slovakia', currencyCode: 'EUR' },
  { code: 'SI', name: 'Slovenia', currencyCode: 'EUR' },
  { code: 'SB', name: 'Solomon Islands', currencyCode: 'SBD' },
  { code: 'SO', name: 'Somalia', currencyCode: 'SOS' },
  { code: 'ZA', name: 'South Africa', currencyCode: 'ZAR' },
  { code: 'GS', name: 'South Georgia and the South Sandwich Islands', currencyCode: 'GBP' },
  { code: 'SS', name: 'South Sudan', currencyCode: 'SSP' },
  { code: 'ES', name: 'Spain', currencyCode: 'EUR' },
  { code: 'LK', name: 'Sri Lanka', currencyCode: 'LKR' },
  { code: 'SD', name: 'Sudan', currencyCode: 'SDG' },
  { code: 'SR', name: 'Suriname', currencyCode: 'SRD' },
  { code: 'SJ', name: 'Svalbard and Jan Mayen', currencyCode: 'NOK' },
  { code: 'SE', name: 'Sweden', currencyCode: 'SEK' },
  { code: 'CH', name: 'Switzerland', currencyCode: 'CHF' },
  { code: 'SY', name: 'Syrian Arab Republic', currencyCode: 'SYP' },
  { code: 'TW', name: 'Taiwan, Province of China', currencyCode: 'TWD' },
  { code: 'TJ', name: 'Tajikistan', currencyCode: 'TJS' },
  { code: 'TZ', name: 'Tanzania, United Republic of', currencyCode: 'TZS' },
  { code: 'TH', name: 'Thailand', currencyCode: 'THB' },
  { code: 'TL', name: 'Timor-Leste', currencyCode: 'USD' },
  { code: 'TG', name: 'Togo', currencyCode: 'XOF' },
  { code: 'TK', name: 'Tokelau', currencyCode: 'NZD' },
  { code: 'TO', name: 'Tonga', currencyCode: 'TOP' },
  { code: 'TT', name: 'Trinidad and Tobago', currencyCode: 'TTD' },
  { code: 'TN', name: 'Tunisia', currencyCode: 'TND' },
  { code: 'TR', name: 'Türkiye', currencyCode: 'TRY' },
  { code: 'TM', name: 'Turkmenistan', currencyCode: 'TMT' },
  { code: 'TC', name: 'Turks and Caicos Islands', currencyCode: 'USD' },
  { code: 'TV', name: 'Tuvalu', currencyCode: 'AUD' },
  { code: 'UG', name: 'Uganda', currencyCode: 'UGX' },
  { code: 'UA', name: 'Ukraine', currencyCode: 'UAH' },
  { code: 'AE', name: 'United Arab Emirates', currencyCode: 'AED' },
  { code: 'GB', name: 'United Kingdom of Great Britain and Northern Ireland', currencyCode: 'GBP' },
  { code: 'US', name: 'United States of America', currencyCode: 'USD' },
  { code: 'UM', name: 'United States Minor Outlying Islands', currencyCode: 'USD' },
  { code: 'UY', name: 'Uruguay', currencyCode: 'UYU' },
  { code: 'UZ', name: 'Uzbekistan', currencyCode: 'UZS' },
  { code: 'VU', name: 'Vanuatu', currencyCode: 'VUV' },
  { code: 'VE', name: 'Venezuela (Bolivarian Republic of)', currencyCode: 'VES' },
  { code: 'VN', name: 'Viet Nam', currencyCode: 'VND' },
  { code: 'VG', name: 'Virgin Islands (British)', currencyCode: 'USD' },
  { code: 'VI', name: 'Virgin Islands (U.S.)', currencyCode: 'USD' },
  { code: 'WF', name: 'Wallis and Futuna', currencyCode: 'XPF' },
  { code: 'EH', name: 'Western Sahara', currencyCode: 'MAD' },
  { code: 'YE', name: 'Yemen', currencyCode: 'YER' },
  { code: 'ZM', name: 'Zambia', currencyCode: 'ZMW' },
  { code: 'ZW', name: 'Zimbabwe', currencyCode: 'ZWL' },
];

export async function seedCountries() {
  let pool: Pool | null = null;

  try {
    loadLocalEnv();

    const host = process.env.PG_HOST;
    const database = process.env.PG_DATABASE;
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;

    if (!host || !database || !user || typeof password !== 'string') {
      throw new Error('Database env vars PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD must all be set as strings');
    }

    pool = new Pool({
      host,
      database,
      user,
      password,
      port: parseInt(process.env.PG_PORT || '5432', 10),
    });

    let inserted = 0;

    for (const country of COUNTRIES) {
      await pool.query(
        `INSERT INTO countries (code, name, currency_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name,
               currency_code = EXCLUDED.currency_code,
               updated_at = now()`,
        [country.code, country.name, country.currencyCode],
      );

      inserted += 1;
    }

    console.log(`Seeded/updated ${inserted} countries.`);
  } catch (error) {
    console.error('Error seeding countries:', error);
    throw error;
  } finally {
    if (pool) await pool.end();
  }
}

if (require.main === module) {
  seedCountries().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
