const StreamDetails = () => {
  return (
    <div className="p-4 bg-gray-100 rounded shadow text-sm space-y-2">
      <div>
        <strong>Quality:</strong> Auto
      </div>
      <div>
        <strong>Latency:</strong> ~3–5s
      </div>
      <div>
        <strong>Format:</strong> HLS (WebRTC → FFMPEG)
      </div>
    </div>
  );
};

export default StreamDetails;
