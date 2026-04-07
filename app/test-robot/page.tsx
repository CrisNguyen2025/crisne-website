export const metadata = {
  title: "Test Robot",
  description: "This is the test robot page.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TestRobotPage() {
  return (
    <div>
      <h1>Test Robot</h1>
      <p>This is the test robot page.</p>
    </div>
  );
}
