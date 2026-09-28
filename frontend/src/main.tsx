import React from 'react';
import ReactDOM from 'react-dom/client';
import Map from '~/map/Map';
import '~/styles/index.css';

function App() {
  return (
    <main className="app">
      <Map />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);