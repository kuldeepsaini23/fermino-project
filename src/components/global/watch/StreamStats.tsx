
import { Wifi, Users } from "lucide-react";

interface Props {
  isLive: boolean;
  viewers: number;
}

const StreamStats = ({ isLive, viewers }: Props) => {
  return (
    <div className="flex items-center justify-between p-4 bg-white rounded shadow">
      <div className="flex items-center gap-2 text-red-600">
        <Wifi className="w-4 h-4" />
        {isLive ? "Live" : "Offline"}
      </div>
      <div className="flex items-center gap-2 text-blue-600">
        <Users className="w-4 h-4" />
        {viewers} viewers
      </div>
    </div>
  );
}


export default StreamStats;