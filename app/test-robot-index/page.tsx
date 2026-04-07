export const metadata = {
  title: "Test Robot",
  description: "This is the test robot page.",
  robots: {
    index: false,
    follow: false,
  },
};
export default function TestRobotIndexPage() {
  return (
    <div>
      <h1>Test Robot Indexed</h1>
      <p>This is the test robot page indexed.</p>
    </div>
  );
}
