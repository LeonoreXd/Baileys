export interface CommandContext {
    sock: any;
    msg: any;
    args: string[];
    text: string;
    jid: string;
    sender: string;
    isGroup: boolean;
}
export interface Command {
    name: string;
    aliases?: string[];
    description?: string;
    execute(ctx: CommandContext): Promise<void> | void;
}
export interface CommandHandlerOptions {
    commandsDir: string;
    prefix?: string;
    logger?: any;
    onError?: (error: any, msg: any) => void;
}
export interface CommandHandler {
    commands: Map<string, Command>;
    reload: () => void;
    stop: () => void;
}
export function createCommandHandler(sock: any, options: CommandHandlerOptions): CommandHandler;
