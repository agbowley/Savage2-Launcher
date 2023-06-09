import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";

function App() {
  const [downloadMsg, setDownloadMsg] = useState("");

  async function download() {
    try {
      setDownloadMsg("Loading...");
      await invoke("download_yarg");
      setDownloadMsg("Done!");
    } catch (e) {
      setDownloadMsg(`FAILED: ${e}`);
    }
  }

  async function play() {
    try {
      setDownloadMsg("Launching...");
      await invoke("play_yarg");
      setDownloadMsg("Done!");
    } catch (e) {
      setDownloadMsg(`FAILED: ${e}`);
    }
  }

  return (
    <div className="container">
      <h1>Welcome to YAL!</h1>

      <button onClick={() => download()}>Download command</button>
      <button onClick={() => play()}>Play command</button>
      <p>{downloadMsg}</p>

    </div>
  );
}

export default App;