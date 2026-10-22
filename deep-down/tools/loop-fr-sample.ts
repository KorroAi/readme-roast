// LOOP tool (round 3): a sample of the loop's lines in a language, to read them as a player would.
// Usage: node tools/run-ts.mjs tools/loop-fr-sample.ts [fr|en]
import { setLanguage, t } from '../src/i18n';
import { arrivalCard } from '../src/game/quests/Guide';
import { daily } from '../src/game/quests/Daily';
import { ITEMS } from '../src/config/items';
import { inSentence } from '../src/game/quests/Quests';

export default function main(args: string[]): void {
  setLanguage(args[0] ?? 'fr');
  const g = inSentence(t('mob.amberMatriarch'));
  const lines = [
    t('quest.main.stratum', { stratum: 'I' }),
    t('quest.step.lairs', { stratum: t('stratum.1'), have: 0, need: 2 }),
    t('quest.step.guardian', { guardian: g, biome: t('biome.amberHollows.name') }),
    t('quest.step.prepare', { pick: t(ITEMS.copperPick.name) }),
    t('quest.step.gate', { stratum: t('stratum.1') }),
    t('quest.shardFrom', { biome: t('biome.amberHollows.name'), count: 1 }),
    t('task.places', { biome: t('biome.mushroomForest.name'), have: 1, need: 3 }),
    t('craft3.missing', { items: t('loop3.countFrom', { n: 2, item: t(ITEMS.heartwood.name), from: t('biome.rootGalleries.name') }) }),
    t('hazard.warnLine', { what: t('hazard.warn.cold'), fix: t('hazard.fix.item', { item: t(ITEMS.warmingTonic.name), n: 2 }) }),
    t('advice.armour', { item: t(ITEMS.furCoat.name), hazard: t('hazard.noun.cold') }),
    t('tut.doneReward', { done: t('tut.done'), reward: `${t('loop3.plus', { n: 6, item: t(ITEMS.torch.name) })}${t('loop3.listSep')}${t('loop3.plus', { n: 2, item: t(ITEMS.bandage.name) })}` }),
    t('trip3.title.lift', { stratum: 'III' }),
    daily(20400).title + ' — ' + daily(20400).goalText + ' — ' + daily(20400).modTexts.join(' / '),
  ];
  for (const l of lines) console.log('  ' + l);
  const c = arrivalCard('frostCaverns', true);
  console.log(`  [${c.name}] ${c.line} | ${c.hazard} | ${c.counter} | ${c.rumour}`);
}
