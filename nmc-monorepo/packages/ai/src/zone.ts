const ZONES: Array<{ name: string; match: string[] }> = [
  { name: 'Dhaka North',     match: ['dhaka north','mirpur','uttara','agargaon','dhanmondi','gulshan'] },
  { name: 'Dhaka South',     match: ['dhaka south','motijheel','ramna','tejgaon','lalbagh'] },
  { name: 'CTG Zone',        match: ['ctg','chattogram','chittagong','sonagazi','hajiganj'] },
  { name: 'Sylhet Zone',     match: ['syl','sylhet'] },
  { name: 'Barishal Zone',   match: ['bar','barisal'] },
  { name: 'Khulna Zone',     match: ['khu','khulna'] },
  { name: 'Rajshahi Zone',   match: ['raj','rajshahi'] },
  { name: 'Rangpur Zone',    match: ['rang','rangpur'] },
  { name: 'Mymensingh Zone', match: ['mym','mymensingh'] },
  { name: 'ALL Zone',        match: ['all','nationwide','country'] },
];

/** Pull the zone name from free text. Returns '' if no match. */
export function inferZone(text: string): string {
  const t = (text || '').toLowerCase();
  for (const z of ZONES) if (z.match.some((m) => t.includes(m))) return z.name;
  return '';
}

export const ZONE_LIST = ZONES.map((z) => z.name);
