import type { Registry } from '../registry.ts';

/**
 * India's states and union territories, as entities.
 *
 * Ids follow ISO 3166-2:IN, so they are stable against renames and can be checked
 * against a published list rather than invented here. Aliases carry the spellings real
 * datasets use — the survey's "A & N Islands", the ampersands, the merged territory —
 * which used to live in a table inside the NFHS reader where no other importer could
 * see them (§05 Decision 02).
 *
 * `DNHDD` appears on two entities on purpose: the survey reports the merged union
 * territory while the official boundary set still carries both constituents, so the
 * value has to reach both or one of them goes blank with nothing to explain it.
 */
export const INDIA_STATES: Registry = {
  entities: [
    { id: 'geo:IN-AN', name: 'Andaman and Nicobar Islands', aliases: ['A & N Islands', 'A and N Islands'] },
    { id: 'geo:IN-AP', name: 'Andhra Pradesh' },
    { id: 'geo:IN-AR', name: 'Arunachal Pradesh' },
    { id: 'geo:IN-AS', name: 'Assam' },
    { id: 'geo:IN-BR', name: 'Bihar' },
    { id: 'geo:IN-CH', name: 'Chandigarh' },
    { id: 'geo:IN-CT', name: 'Chhattisgarh' },
    { id: 'geo:IN-DN', name: 'Dadra and Nagar Haveli', aliases: ['DNHDD', 'Dadra & Nagar Haveli'] },
    { id: 'geo:IN-DD', name: 'Daman and Diu', aliases: ['DNHDD', 'Daman & Diu'] },
    { id: 'geo:IN-DL', name: 'Delhi', aliases: ['NCT of Delhi', 'Delhi (NCT)'] },
    { id: 'geo:IN-GA', name: 'Goa' },
    { id: 'geo:IN-GJ', name: 'Gujarat' },
    { id: 'geo:IN-HR', name: 'Haryana' },
    { id: 'geo:IN-HP', name: 'Himachal Pradesh' },
    { id: 'geo:IN-JK', name: 'Jammu and Kashmir', aliases: ['Jammu & Kashmir'] },
    { id: 'geo:IN-JH', name: 'Jharkhand' },
    { id: 'geo:IN-KA', name: 'Karnataka' },
    { id: 'geo:IN-KL', name: 'Kerala' },
    { id: 'geo:IN-LA', name: 'Ladakh' },
    { id: 'geo:IN-LD', name: 'Lakshadweep' },
    { id: 'geo:IN-MP', name: 'Madhya Pradesh' },
    { id: 'geo:IN-MH', name: 'Maharashtra' },
    { id: 'geo:IN-MN', name: 'Manipur' },
    { id: 'geo:IN-ML', name: 'Meghalaya' },
    { id: 'geo:IN-MZ', name: 'Mizoram' },
    { id: 'geo:IN-NL', name: 'Nagaland' },
    { id: 'geo:IN-OR', name: 'Odisha', aliases: ['Orissa'] },
    { id: 'geo:IN-PY', name: 'Puducherry', aliases: ['Pondicherry'] },
    { id: 'geo:IN-PB', name: 'Punjab' },
    { id: 'geo:IN-RJ', name: 'Rajasthan' },
    { id: 'geo:IN-SK', name: 'Sikkim' },
    { id: 'geo:IN-TN', name: 'Tamil Nadu' },
    { id: 'geo:IN-TG', name: 'Telangana', aliases: ['Telengana'] },
    { id: 'geo:IN-TR', name: 'Tripura' },
    { id: 'geo:IN-UP', name: 'Uttar Pradesh' },
    { id: 'geo:IN-UT', name: 'Uttarakhand', aliases: ['Uttaranchal'] },
    { id: 'geo:IN-WB', name: 'West Bengal' },
  ],
};
