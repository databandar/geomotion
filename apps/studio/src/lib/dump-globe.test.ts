import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { circleOfHumanityProject, globeGdpTourProject, globeTourProject, paintedWorldProject, routeStoryProject } from './fixtures';

it('dumps the globe tour for the pipeline', () => {
  writeFileSync('/tmp/globe-tour.geomotion.json', JSON.stringify(globeTourProject(), null, 2));
});

it('dumps the GDP globe tour for the pipeline', () => {
  writeFileSync('/tmp/globe-gdp.geomotion.json', JSON.stringify(globeGdpTourProject(), null, 2));
});

it('dumps the painted-world pilot for the pipeline', () => {
  writeFileSync('/tmp/painted-world.geomotion.json', JSON.stringify(paintedWorldProject(), null, 2));
});

it('dumps the routes-as-stories pilot for the pipeline', () => {
  writeFileSync('/tmp/route-story.geomotion.json', JSON.stringify(routeStoryProject(), null, 2));
});

it('dumps the circle-of-humanity pilot for the pipeline', () => {
  writeFileSync('/tmp/circle-of-humanity.geomotion.json', JSON.stringify(circleOfHumanityProject(), null, 2));
});
