// LOOP: list each biome's hosts, floor and ores with their tiers and drops (economy checks).
import { BIOMES, STRATA } from '../src/config/biomes';
import { blockDef } from '../src/config/blocks';
import { t } from '../src/i18n';

export default function main(): void {
  for (const s of STRATA) {
    for (const b of s.biomes) {
      const d = BIOMES[b];
      const desc = (id: number) => {
        const bd = blockDef(id);
        return `${t(bd.name)}[t${bd.tier} h${bd.hardness}${bd.plain ? ' plain' : ''}${bd.drop ? ' ->' + bd.drop.item + ' ' + bd.drop.min + '-' + bd.drop.max + '@' + bd.drop.chance : ''}]`;
      };
      console.log(`S${s.index} ${b}: hazard ${d.hazard.kind}/${d.hazard.strength}; hosts ${d.hosts.map(desc).join(', ')}; floor ${desc(d.floor)}`);
      for (const o of d.ores) console.log(`    ore ${desc(o.block)} rarity ${o.rarity} tier ${o.tier} item ${o.item} w ${o.weight}`);
    }
  }
}
