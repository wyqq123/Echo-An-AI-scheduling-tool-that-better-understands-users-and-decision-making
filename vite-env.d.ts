// 告诉 TS：看到以 .md?raw 结尾的引入，它们都是 string 类型
declare module '*.md?raw' {
    const content: string;
    export default content;
  }
  
  // 如果你以后还要引入 .txt 或其他原始文件，也可以顺便加上
  declare module '*?raw' {
    const content: string;
    export default content;
  }