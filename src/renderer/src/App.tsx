import TerminalComponent from './components/Terminal'

function App(): React.ReactElement {
  return (
    <div id="app" style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        flex: 1,
        overflow: 'hidden',
        padding: '4px',
      }}>
        <TerminalComponent />
      </div>
    </div>
  )
}

export default App
