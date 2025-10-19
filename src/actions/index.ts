export type RegisterCtx = {
  yawToDir: () => { front: any; back: any; left: any; right: any };
  getJaItemName: (name: string) => string;
};

export type RegisterFn = (bot: any, commandHandlers: Map<string, any>, ctx: RegisterCtx) => void;

export function registerActions(bot: any, commandHandlers: Map<string, any>, ctx: RegisterCtx) {
  // TS エントリポイント（実行は JS を利用）
}

