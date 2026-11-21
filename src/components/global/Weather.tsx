import { useEffect, useState } from "react"

const coords = {
  latitude: 40.6782,
  longitude: -73.9442,
}

const WeatherComponent: React.FC = () => {
  const [temperature, setTemperature] = useState<number | null>(null)
  const [unit, setUnit] = useState<"fahrenheit" | "celsius">(() => {
    const savedUnit = localStorage.getItem("temperatureUnit")
    return savedUnit === "celsius" ? "celsius" : "fahrenheit"
  })

  useEffect(() => {
    const fetchWeather = async () => {
      const params = {
        ...coords,
        hourly: "temperature_2m",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
      }

      const queryString = new URLSearchParams(params as any).toString()
      const url = `https://api.open-meteo.com/v1/forecast?${queryString}`

      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error("Network response was not ok")
        }
        const data = await response.json()
        const weatherData = data.hourly
        setTemperature(weatherData.temperature_2m[0])
      } catch (error) {
        console.error("Error fetching weather data:", error)
      }
    }

    fetchWeather()
  }, [])

  const toggleUnit = () => {
    const newUnit = unit === "fahrenheit" ? "celsius" : "fahrenheit"
    setUnit(newUnit)
    localStorage.setItem("temperatureUnit", newUnit)
  }

  const getDisplayText = () => {
    if (unit === "fahrenheit" && temperature !== null) {
      return `${Math.round(temperature)}º F in`
    } else if (unit === "celsius" && temperature !== null) {
      const celsius = ((temperature - 32) * 5) / 9
      return `${celsius.toFixed(2)}º C in`
    } else {
      return ""
    }
  }

  return (
    <button onClick={toggleUnit}>{getDisplayText()} Brooklyn, New York</button>
  )
}

export default WeatherComponent
