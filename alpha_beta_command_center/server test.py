import requests

url = "http://10.104.50.124:3000/get-lists"
params = {"username": "cmollica%40athenahealth.com"}  # URL-encoded email

response = requests.get(url, params=params)

print("Status Code:", response.status_code)
print("Response Body:")
print(response.text)
