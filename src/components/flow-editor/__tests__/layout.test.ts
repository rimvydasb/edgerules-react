import {describe, expect, it} from 'vitest';
import {computeFunctionNodeLayout} from '../function-node/layout';

const base = {titleWidth: 0, calleeLineWidth: 0, argumentNameWidths: [30], resultNameWidths: [30]};

describe('computeFunctionNodeLayout', () => {
    it('rounds each track up to whole 40px steps', () => {
        const layout = computeFunctionNodeLayout({...base, argumentNameWidths: [45], resultNameWidths: [90]});
        expect(layout.argumentTrack % 40).toBe(0);
        expect(layout.resultTrack % 40).toBe(0);
        expect(layout.argumentTrack).toBe(80);
        expect(layout.resultTrack).toBe(160);
        expect(layout.width).toBe(240);
    });

    it('limits a track to 2 steps at least and 4 steps at most', () => {
        expect(computeFunctionNodeLayout(base)).toMatchObject({argumentTrack: 80, resultTrack: 80});
        expect(computeFunctionNodeLayout({...base, argumentNameWidths: [500], resultNameWidths: [500]})).toMatchObject({
            argumentTrack: 160,
            resultTrack: 160,
        });
    });

    it('lets a wider header win and gives the larger half to the result track', () => {
        // Tracks take 4 steps; a 400px header needs 10, so 6 extra steps split 3 + 3.
        const even = computeFunctionNodeLayout({...base, titleWidth: 400});
        expect(even).toMatchObject({argumentTrack: 200, resultTrack: 200, width: 400});
        // 5 extra steps split 2 + 3.
        const odd = computeFunctionNodeLayout({...base, calleeLineWidth: 360});
        expect(odd).toMatchObject({argumentTrack: 160, resultTrack: 200, width: 360});
    });

    it('ignores a header narrower than the tracks', () => {
        expect(computeFunctionNodeLayout({...base, titleWidth: 100}).width).toBe(160);
    });

    it('has no argument track for zero parameters', () => {
        const layout = computeFunctionNodeLayout({...base, argumentNameWidths: [], titleWidth: 300});
        expect(layout.argumentTrack).toBe(0);
        expect(layout.resultTrack).toBe(320);
        expect(layout.width).toBe(320);
    });
});
