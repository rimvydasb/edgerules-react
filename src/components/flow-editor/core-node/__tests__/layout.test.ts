import {describe, expect, it} from 'vitest';
import {computeTrackLayout} from '../layout';

const base = {titleWidth: 0, summaryWidth: 0, inputNameWidths: [30], outputNameWidths: [30]};

describe('computeTrackLayout', () => {
    it('rounds each track up to whole 40px steps', () => {
        const layout = computeTrackLayout({...base, inputNameWidths: [45], outputNameWidths: [90]});
        expect(layout.inputTrack % 40).toBe(0);
        expect(layout.outputTrack % 40).toBe(0);
        expect(layout.inputTrack).toBe(80);
        expect(layout.outputTrack).toBe(160);
        expect(layout.width).toBe(240);
    });

    it('limits a track to 2 steps at least and 4 steps at most', () => {
        expect(computeTrackLayout(base)).toMatchObject({inputTrack: 80, outputTrack: 80});
        expect(computeTrackLayout({...base, inputNameWidths: [500], outputNameWidths: [500]})).toMatchObject({
            inputTrack: 160,
            outputTrack: 160,
        });
    });

    it('lets a wider header win and gives the larger half to the output track', () => {
        // Tracks take 4 steps; a 400px header needs 10, so 6 extra steps split 3 + 3.
        const even = computeTrackLayout({...base, titleWidth: 400});
        expect(even).toMatchObject({inputTrack: 200, outputTrack: 200, width: 400});
        // 5 extra steps split 2 + 3.
        const odd = computeTrackLayout({...base, summaryWidth: 360});
        expect(odd).toMatchObject({inputTrack: 160, outputTrack: 200, width: 360});
    });

    it('ignores a header narrower than the tracks', () => {
        expect(computeTrackLayout({...base, titleWidth: 100}).width).toBe(160);
    });

    it('has no input track without input names', () => {
        const layout = computeTrackLayout({...base, inputNameWidths: [], titleWidth: 300});
        expect(layout.inputTrack).toBe(0);
        expect(layout.outputTrack).toBe(320);
        expect(layout.width).toBe(320);
    });
});
