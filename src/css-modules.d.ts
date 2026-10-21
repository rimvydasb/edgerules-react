// CSS Modules are compiled by Vite (Storybook, Vitest) and by esbuild's `local-css` loader (tsdown),
// both of which export every class name as a named export — hence `import * as classes`.
declare module '*.module.css' {
    const classes: {readonly [className: string]: string};
    export = classes;
}
