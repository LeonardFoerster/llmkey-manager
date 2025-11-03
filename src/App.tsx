export default function App() {
  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-8">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-primary">DaisyUI läuft!</h2>
          <p className="text-success">Grün und schön!</p>
          <div className="card-actions justify-end">
            <button className="btn btn-primary">Test-Button</button>
          </div>
        </div>
      </div>
    </div>
  );
}

<button
  onClick={() => document.documentElement.setAttribute("data-theme", "dark")}
  className="btn btn-outline btn-sm"
>
  Dark Mode
</button>;
