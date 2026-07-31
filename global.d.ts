declare module '*?raw' {
  const content: string;
  export default content;
}
declare module '*?url' {
  const content: string;
  export default content;
}
declare module '*.css' {
  const content: unknown;
  export default content;
}
declare module '*.html' {
  const content: string;
  export default content;
}
declare module '*.md' {
  const content: string;
  export default content;
}
declare module '*.yaml' {
  const content: any;
  export default content;
}
declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

declare const YAML: typeof import('yaml');

declare const z: typeof import('zod');
declare namespace z {
  export type infer<T> = import('zod').infer<T>;
  export type input<T> = import('zod').input<T>;
  export type output<T> = import('zod').output<T>;
}

declare module 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js' {
  export function registerMvuSchema(
    schema: z.ZodType<Record<string, any>> | (() => z.ZodType<Record<string, any>>),
  ): void;
}
<<<<<<< HEAD

// 缺类型的 CDN/外部模块兜底声明(webpack externals 走 jsdelivr,node_modules 无装)。
// lucide-static:图标名众多,用「简写环境模块」(整模块 any)允许任意 named import。
declare module 'lucide-static';
// @floating-ui/dom:有限 export,需保留 Placement 作为类型用。
declare module '@floating-ui/dom' {
  export const computePosition: any;
  export const autoUpdate: any;
  export const offset: any;
  export const flip: any;
  export const shift: any;
  export const arrow: any;
  export const size: any;
  export const autoPlacement: any;
  export const inline: any;
  export const limitShift: any;
  export type Placement = string;
  export type Middleware = any;
  export type ComputePositionConfig = any;
}
=======
>>>>>>> d3edc570be82dfef999b800e6b45a51d0863a025
