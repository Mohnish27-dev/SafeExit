// In-memory mock database for the demo. 
// Note: This data will be cleared whenever the Next.js development server restarts.
let mockUsers = {};

export async function POST(request) {
  try {
    const data = await request.json();
    if (!data.rollNo) {
      return Response.json({ error: "Roll number is required" }, { status: 400 });
    }
    
    // Save to our in-memory store
    mockUsers[data.rollNo] = data;
    
    return Response.json({ success: true, message: "Profile saved successfully" });
  } catch (error) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rollNo = searchParams.get("rollNo");
  
  if (!rollNo) {
    return Response.json({ error: "Roll number is required" }, { status: 400 });
  }
  
  const user = mockUsers[rollNo];
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }
  
  return Response.json({ success: true, profile: user });
}
