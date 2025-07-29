import { Consumer } from 'mediasoup-client/types';

export interface RemoteProducer {
  id: string;
  socketId: string;
  consumer?: Consumer;
}
