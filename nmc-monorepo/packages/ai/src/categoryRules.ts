import type { CategoryRule } from './types.js';

/**
 * Faithful port of `CATEGORY_RULES` from `NMC Dashboard/js/ai.js`.
 * Do not edit these without coordinating with the upstream legacy module.
 */
export const CATEGORY_RULES: CategoryRule[] = [
  { cat: 'FO Link down',          dept: 'NCSS',                       issue: 'Fiber / Physical', tags: ['fiber','fo','cable'] },
  { cat: 'NTTN Last Mile',        dept: 'NCSS',                       issue: 'Fiber / Physical', tags: ['lastmile','last mile','nttn'] },
  { cat: 'NTTN Capacity',         dept: 'Survey & Transmission',      issue: 'NTTN Capacity',    tags: ['nttn','capacity','scl','f@h','fah'] },
  { cat: 'NTTN End',              dept: 'Survey & Transmission',      issue: 'NTTN End',         tags: ['nttn end','pop down','base site'] },
  { cat: 'Backbone Link',         dept: 'NGNC',                       issue: 'Backbone',         tags: ['backbone'] },
  { cat: 'BL POP Down',           dept: 'Survey & Transmission',      issue: 'Telco POP',        tags: ['bl pop','banglalink'] },
  { cat: 'GP POP Down',           dept: 'Survey & Transmission',      issue: 'Telco POP',        tags: ['gp pop','grameenphone'] },
  { cat: 'STL POP Down',          dept: 'Survey & Transmission',      issue: 'Telco POP',        tags: ['stl','summit tower'] },
  { cat: 'Telco POP',             dept: 'Survey & Transmission',      issue: 'Telco POP',        tags: ['telco pop','pop'] },
  { cat: 'Router Down',           dept: 'NGNC',                       issue: 'Router',           tags: ['router','router down','loopback'] },
  { cat: 'Switch Down',           dept: 'NGNC',                       issue: 'Switch',           tags: ['switch','switch down'] },
  { cat: 'BGP Flap',              dept: 'NGNC',                       issue: 'Routing',          tags: ['bgp','bgp flap','bgp down'] },
  { cat: 'OSPF Flap',             dept: 'NGNC',                       issue: 'Routing',          tags: ['ospf','ospf flap'] },
  { cat: 'IIG Down',              dept: 'NGNC',                       issue: 'IIG',              tags: ['iig','iig down'] },
  { cat: 'IIG Traffic Fall',      dept: 'NGNC',                       issue: 'IIG Traffic',      tags: ['iig','traffic fall'] },
  { cat: 'Traffic Fall',          dept: 'NGNC',                       issue: 'Traffic',          tags: ['traffic fall'] },
  { cat: 'Traffic Congestion',    dept: 'NGNC',                       issue: 'Traffic',          tags: ['congestion','full','bandwidth'] },
  { cat: 'NIX Logical',           dept: 'NGNC',                       issue: 'NIX',              tags: ['nix'] },
  { cat: 'Upstream',              dept: 'NGNC',                       issue: 'Upstream / PNI',   tags: ['upstream','pni'] },
  { cat: 'DDoS Attack',           dept: 'NGNC',                       issue: 'Security',         tags: ['ddos','flood','syn','ack'] },
  { cat: 'BRAS Down',             dept: 'BNOC',                       issue: 'BRAS',             tags: ['bras','bras down','own bras'] },
  { cat: 'Dist BRAS Down',        dept: 'BNOC',                       issue: 'Dist BRAS',        tags: ['dist bras','distributor','service agent'] },
  { cat: 'OLT Issue',             dept: 'BNOC',                       issue: 'OLT/ONU',          tags: ['olt','onu','pon'] },
  { cat: 'BTS Down',              dept: 'BTS & Power Infrastructure', issue: 'BTS',              tags: ['bts','bts down'] },
  { cat: 'Power / Surecom',       dept: 'BTS & Power Infrastructure', issue: 'Power',            tags: ['power','surecom','electricity'] },
  { cat: 'IPTSB',                 dept: 'IPTSB',                      issue: 'IPTSB',            tags: ['iptsb'] },
  { cat: 'I&I',                   dept: 'I&I',                        issue: 'I&I',              tags: ['i&i'] }
];
