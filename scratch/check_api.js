async function checkApi() {
  // Use local dev server URL
  try {
    const res = await fetch('http://localhost:3000/api/vendors');
    const data = await res.json();
    const studioTest = data.vendors.find(v => v.company_name === 'Studio Test');
    console.log('Vendor:', studioTest?.company_name);
    console.log('Documents:', JSON.stringify(studioTest?.documents, null, 2));
    console.log('Policies:', studioTest?.policy_lines?.length);
  } catch (err) {
    console.error(err);
  }
}

checkApi();
