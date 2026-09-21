import amqp, { type ChannelModel, type ConfirmChannel } from 'amqplib';

import { loadRabbitMqConfig, type RabbitMqConfig } from './config.js';

export type RabbitConnection = {
  connection: ChannelModel;
  channel: ConfirmChannel;
  close: () => Promise<void>;
};

export async function connectRabbitMq(
  config: RabbitMqConfig = loadRabbitMqConfig(),
): Promise<RabbitConnection> {
  const connection = await amqp.connect(config.url);
  const channel = await connection.createConfirmChannel();

  const close = async (): Promise<void> => {
    await channel.close();
    await connection.close();
  };

  return { connection, channel, close };
}
